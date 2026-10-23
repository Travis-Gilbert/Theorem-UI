//! What Servo tells the host about the page (plan D2), queued for the page
//! view, plus the two decisions the host makes on the spot: which navigations
//! stay in the app, and what happens to new windows.
//!
//! SOURCING: Servo's `WebViewDelegate`; `url` for origins.
//! The navigation policy is ours: it is this app's rule, not a library's.

use std::cell::{Cell, RefCell};
use std::collections::VecDeque;
use std::rc::{Rc, Weak};

use dpi::PhysicalSize;
use servo::{
    ConsoleLogLevel, CreateNewWebViewRequest, Cursor, EmbedderControl, EmbedderControlId,
    InputEventId, InputEventResult, NavigationRequest, RenderingContext, WebView,
    WebViewDelegate, WebViewId, WindowRenderingContext,
};
use url::{Origin, Url};

/// One thing the page view has to act on after Servo's turn of the loop.
pub enum PageEvent {
    Cursor(Cursor),
    InputHandled(InputEventId, InputEventResult),
    ShowControl(EmbedderControl),
    HideControl(EmbedderControlId),
    Title(Option<String>),
    Crashed(String),
    OpenExternally(Url),
}

pub struct Delegate {
    /// Popups share this delegate; `request_create_new` hands them this.
    this: Weak<Delegate>,
    events: RefCell<VecDeque<PageEvent>>,
    /// The app's origin and the live-block origin, once the server is up.
    allowed: RefCell<Vec<Origin>>,
    page: Cell<Option<WebViewId>>,
    /// Web views opened by `window.open` or `target="_blank"`, held only until
    /// their first navigation says where they meant to go.
    popups: RefCell<Vec<WebView>>,
    rendering_context: Rc<WindowRenderingContext>,
}

impl Delegate {
    pub fn new(rendering_context: Rc<WindowRenderingContext>) -> Rc<Self> {
        Rc::new_cyclic(|this| Self {
            this: this.clone(),
            events: RefCell::default(),
            allowed: RefCell::default(),
            page: Cell::new(None),
            popups: RefCell::default(),
            rendering_context,
        })
    }

    pub fn set_page(&self, webview: &WebView) {
        self.page.set(Some(webview.id()));
    }

    pub fn allow_origins(&self, origins: Vec<Origin>) {
        *self.allowed.borrow_mut() = origins;
    }

    pub fn take_events(&self) -> VecDeque<PageEvent> {
        std::mem::take(&mut *self.events.borrow_mut())
    }

    fn push(&self, event: PageEvent) {
        self.events.borrow_mut().push_back(event);
    }

    fn is_page(&self, webview: &WebView) -> bool {
        self.page.get() == Some(webview.id())
    }

    /// A popup has shown where it was going: send that to the system browser
    /// and let the popup go.
    fn release_popup(&self, webview: &WebView, url: &Url) -> bool {
        let mut popups = self.popups.borrow_mut();
        let before = popups.len();
        popups.retain(|popup| popup.id() != webview.id());
        if popups.len() == before {
            return false;
        }
        if opens_externally(url) {
            self.push(PageEvent::OpenExternally(url.clone()));
        }
        true
    }
}

/// Where a navigation may go. The page is the app; everything else on the web
/// belongs to the person's own browser (plan D2, "New windows").
#[derive(Debug, PartialEq)]
pub enum Verdict {
    Allow,
    OpenExternally,
    Deny,
}

pub fn verdict(url: &Url, allowed: &[Origin]) -> Verdict {
    match url.scheme() {
        "about" | "blob" | "data" => Verdict::Allow,
        "http" | "https" if allowed.contains(&url.origin()) => Verdict::Allow,
        _ if opens_externally(url) => Verdict::OpenExternally,
        _ => Verdict::Deny,
    }
}

fn opens_externally(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto")
}

impl WebViewDelegate for Delegate {
    fn notify_new_frame_ready(&self, webview: WebView) {
        if self.is_page(&webview) {
            webview.paint();
            webview.rendering_context().present();
        }
    }

    fn notify_cursor_changed(&self, webview: WebView, cursor: Cursor) {
        if self.is_page(&webview) {
            self.push(PageEvent::Cursor(cursor));
        }
    }

    fn notify_input_event_handled(
        &self,
        webview: WebView,
        event_id: InputEventId,
        result: InputEventResult,
    ) {
        if self.is_page(&webview) {
            self.push(PageEvent::InputHandled(event_id, result));
        }
    }

    fn notify_page_title_changed(&self, webview: WebView, title: Option<String>) {
        if self.is_page(&webview) {
            self.push(PageEvent::Title(title));
        }
    }

    fn notify_crashed(&self, webview: WebView, reason: String, backtrace: Option<String>) {
        log::error!("page crashed: {reason}\n{}", backtrace.unwrap_or_default());
        if self.is_page(&webview) {
            self.push(PageEvent::Crashed(reason));
        }
    }

    fn notify_url_changed(&self, webview: WebView, url: Url) {
        // A popup that loaded without asking still reveals its address here.
        if url.scheme() != "about" {
            self.release_popup(&webview, &url);
        }
    }

    fn notify_closed(&self, webview: WebView) {
        self.popups
            .borrow_mut()
            .retain(|popup| popup.id() != webview.id());
    }

    fn show_console_message(&self, _webview: WebView, level: ConsoleLogLevel, message: String) {
        match level {
            ConsoleLogLevel::Error => log::error!(target: "page", "{message}"),
            ConsoleLogLevel::Warn => log::warn!(target: "page", "{message}"),
            _ => log::info!(target: "page", "{message}"),
        }
    }

    fn request_navigation(&self, webview: WebView, request: NavigationRequest) {
        if !self.is_page(&webview) {
            if request.url.scheme() == "about" {
                request.allow();
            } else {
                self.release_popup(&webview, &request.url);
                request.deny();
            }
            return;
        }
        match verdict(&request.url, &self.allowed.borrow()) {
            Verdict::Allow => request.allow(),
            Verdict::OpenExternally => {
                self.push(PageEvent::OpenExternally(request.url.clone()));
                request.deny();
            }
            Verdict::Deny => {
                log::warn!("refused navigation to {}", request.url);
                request.deny();
            }
        }
    }

    fn request_create_new(&self, _parent: WebView, request: CreateNewWebViewRequest) {
        // `CreateNewWebViewRequest` does not say where the new window is going,
        // so build it off screen and catch its first navigation.
        let context: Rc<dyn RenderingContext> = Rc::new(
            self.rendering_context
                .offscreen_context(PhysicalSize::new(1, 1)),
        );
        let Some(delegate) = self.this.upgrade() else {
            return;
        };
        let webview = request
            .builder(context)
            .delegate(delegate as Rc<dyn WebViewDelegate>)
            .build();
        self.popups.borrow_mut().push(webview);
    }

    fn show_embedder_control(&self, webview: WebView, control: EmbedderControl) {
        // A control from anything but the page is dropped, which answers it.
        if self.is_page(&webview) {
            self.push(PageEvent::ShowControl(control));
        }
    }

    fn hide_embedder_control(&self, webview: WebView, control_id: EmbedderControlId) {
        if self.is_page(&webview) {
            self.push(PageEvent::HideControl(control_id));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app() -> Vec<Origin> {
        vec![
            Url::parse("http://127.0.0.1:4545").unwrap().origin(),
            Url::parse("http://127.0.0.1:4546").unwrap().origin(),
        ]
    }

    fn verdict_for(url: &str) -> Verdict {
        verdict(&Url::parse(url).unwrap(), &app())
    }

    #[test]
    fn the_app_and_block_origins_stay_in_the_page() {
        assert_eq!(verdict_for("http://127.0.0.1:4545/notes/a"), Verdict::Allow);
        assert_eq!(verdict_for("http://127.0.0.1:4546/block/1"), Verdict::Allow);
        assert_eq!(verdict_for("about:blank"), Verdict::Allow);
        assert_eq!(verdict_for("data:text/plain,hi"), Verdict::Allow);
    }

    #[test]
    fn the_rest_of_the_web_opens_in_the_system_browser() {
        assert_eq!(verdict_for("https://example.com/"), Verdict::OpenExternally);
        assert_eq!(verdict_for("http://127.0.0.1:9999/"), Verdict::OpenExternally);
        assert_eq!(verdict_for("mailto:a@example.com"), Verdict::OpenExternally);
    }

    #[test]
    fn other_schemes_are_refused() {
        assert_eq!(verdict_for("file:///etc/passwd"), Verdict::Deny);
        assert_eq!(verdict_for("javascript:alert(1)"), Verdict::Deny);
    }
}
