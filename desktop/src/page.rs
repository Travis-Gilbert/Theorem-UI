//! The main window's page: Servo's web view in a child view over the GPUI
//! window, with GPUI's input routed into it (plan D2, rendering step 1).
//!
//! SOURCING: hand-rolled embedder layer. No crate joins Servo and GPUI; the
//! event translation follows servoshell (`headed_window.rs`) and Theorem's
//! `space_servo_web.rs`, and the child view is Theorem's `webview-surface`.

use std::cell::Cell;
use std::collections::{HashMap, HashSet};
use std::ops::Range;
use std::rc::Rc;

use anyhow::{Context as _, anyhow};
use euclid::Scale;
use gpui_kit::{
    App, AppContext as _, Bounds, Context, CursorStyle, ElementInputHandler, Entity, EntityInputHandler, FocusHandle,
    Focusable, InteractiveElement as _, IntoElement, KeyUpEvent, Keystroke, ModifiersChangedEvent,
    MouseButton as GpuiButton, MouseDownEvent, MouseExitEvent, MouseMoveEvent, MouseUpEvent,
    NavigationDirection, ParentElement as _, PinchEvent, Pixels, Point, Render, ScrollDelta,
    ScrollWheelEvent, Styled as _, Subscription, UTF16Selection, Window, WindowAppearance, canvas,
    div, point, px, size,
};
use raw_window_handle::{
    AppKitDisplayHandle, DisplayHandle, HasWindowHandle, RawDisplayHandle, WindowHandle,
};
use servo::{
    ClipboardAction, CompositionEvent, CompositionState, Cursor, DevicePoint, ImeEvent,
    InputEvent, InputEventId, InputEventResult, InputMethodControl, KeyState,
    MouseButton as ServoButton, MouseButtonAction, MouseButtonEvent, MouseLeftViewportEvent,
    MouseMoveEvent as ServoMouseMove, RenderingContext as _, Theme, WebView, WebViewBuilder,
    WheelDelta, WheelEvent, WheelMode, WindowRenderingContext,
};
use url::Url;
use gpui_kit::component::input::{Copy, Cut, Paste, Redo, SelectAll, Undo};
use webview_surface::ChildSurface;

use crate::controls::Controls;
use crate::delegate::{Delegate, PageEvent};
use crate::engine::Engine;
use crate::keys;

/// The key context the Edit menu's shortcuts bind in.
pub const CONTEXT: &str = "Page";

/// servoshell's line height for wheels that scroll by lines.
const LINE_HEIGHT: f64 = 38.0;

pub struct PageView {
    focus_handle: FocusHandle,
    pub(crate) webview: WebView,
    delegate: Rc<Delegate>,
    surface: ChildSurface,
    /// The page element's last layout, in window points, and the scale it
    /// was placed at.
    pub(crate) bounds: Option<Bounds<Pixels>>,
    pub(crate) scale: f32,
    cursor: CursorStyle,
    /// Keys down now, so another key-down for one of them is a repeat.
    held: HashSet<String>,
    modifiers: gpui_kit::Modifiers,
    /// Shortcuts sent to the page, kept until it says whether it used them;
    /// the ones it did not use go back through GPUI's key bindings.
    shortcuts: HashMap<InputEventId, Keystroke>,
    replaying: Rc<Cell<bool>>,
    pressed: Vec<GpuiButton>,
    pub(crate) last_pointer: Option<Point<Pixels>>,
    /// Text the input method is composing, as last marked.
    marked: Option<String>,
    pub(crate) input_method: Option<InputMethodControl>,
    pub(crate) controls: Controls,
    _subscriptions: Vec<Subscription>,
}

impl PageView {
    /// Put Servo's view over `window`. The native half can fail (no GL
    /// context, no child view); the rest cannot.
    pub fn new(window: &mut Window, cx: &mut App) -> anyhow::Result<Entity<Self>> {
        let scale = window.scale_factor();
        let viewport = window.viewport_size();
        let placement = physical(Bounds::new(point(px(0.), px(0.)), viewport), scale);
        // GPUI's inherent `window_handle` is its own handle; this is AppKit's.
        let parent = HasWindowHandle::window_handle(window)
            .map_err(|error| anyhow!("no native window: {error}"))?
            .as_raw();
        let surface = webview_surface::adopt_parented(parent, placement).map_err(|e| anyhow!(e))?;
        let child = surface
            .appkit_window_handle()
            .context("the page's child view has no native handle")?;
        let display = RawDisplayHandle::AppKit(AppKitDisplayHandle::new());
        // SAFETY: the child view lives in `surface`, which this view owns and
        // drops after the web view and its rendering context.
        let rendering_context = unsafe {
            WindowRenderingContext::new(
                DisplayHandle::borrow_raw(display),
                WindowHandle::borrow_raw(child),
                placement.physical_size(),
            )
        }
        .map_err(|error| anyhow!("rendering context: {error:?}"))?;
        rendering_context
            .make_current()
            .map_err(|error| anyhow!("rendering context: {error:?}"))?;
        let rendering_context = Rc::new(rendering_context);

        let delegate = Delegate::new(rendering_context.clone());
        let webview = WebViewBuilder::new(&Engine::servo(cx), rendering_context)
            .hidpi_scale_factor(Scale::new(scale))
            .delegate(delegate.clone())
            .build();
        delegate.set_page(&webview);
        webview.notify_theme_change(theme(window.appearance()));

        Ok(cx.new(|cx: &mut Context<Self>| {
            let focus_handle = cx.focus_handle();
            let replaying = Rc::new(Cell::new(false));
            let subscriptions = vec![
                cx.on_focus(&focus_handle, window, |page, _, _| {
                    page.webview.set_focused(true)
                }),
                cx.on_blur(&focus_handle, window, |page, _, _| {
                    page.release_buttons();
                    page.webview.set_focused(false);
                }),
                cx.observe_window_appearance(window, |page, window, _| {
                    page.webview.notify_theme_change(theme(window.appearance()));
                }),
                Self::intercept_keys(replaying.clone(), window, cx),
            ];
            Self::drain_after_spin(window, cx);
            Self {
                focus_handle,
                webview,
                delegate,
                surface,
                bounds: None,
                scale,
                cursor: CursorStyle::Arrow,
                held: HashSet::new(),
                modifiers: gpui_kit::Modifiers::default(),
                shortcuts: HashMap::new(),
                replaying,
                pressed: Vec::new(),
                last_pointer: None,
                marked: None,
                input_method: None,
                controls: Controls::default(),
                _subscriptions: subscriptions,
            }
        }))
    }

    /// Point the page at the local server: allow its two origins and open the
    /// launch session, which sets the cookie and redirects to the app.
    pub fn open_session(&mut self, port: u16, block_port: u16, secret: &str) {
        let origin = |port| Url::parse(&format!("http://127.0.0.1:{port}")).map(|u| u.origin());
        let (Ok(app), Ok(blocks)) = (origin(port), origin(block_port)) else {
            return;
        };
        self.delegate.allow_origins(vec![app, blocks]);
        match Url::parse(&format!(
            "http://127.0.0.1:{port}/desktop/session?secret={secret}"
        )) {
            Ok(url) => self.webview.load(url),
            Err(error) => log::error!("session url: {error}"),
        }
    }

    /// Send an input event to the page, unless it is gone.
    pub(crate) fn send(&self, event: InputEvent) -> InputEventId {
        self.webview.notify_input_event(event)
    }

    /// Act on what Servo queued during its last turn of the event loop.
    fn drain(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        for event in self.delegate.take_events() {
            match event {
                PageEvent::Cursor(cursor) => {
                    self.cursor = cursor_style(cursor);
                    cx.notify();
                }
                PageEvent::InputHandled(id, result) => self.input_handled(id, result, window, cx),
                PageEvent::ShowControl(control) => self.show_control(control, window, cx),
                PageEvent::HideControl(id) => self.hide_control(id, cx),
                PageEvent::Title(title) => {
                    window.set_window_title(title.as_deref().unwrap_or("Theorem"));
                }
                PageEvent::Crashed(reason) => self.crashed(&reason, window, cx),
                PageEvent::OpenExternally(url) => cx.open_url(url.as_str()),
            }
        }
    }

    /// Servo calls the delegate from inside `spin_event_loop`; the queued
    /// events are handled here, after it returns, with the window in hand.
    fn drain_after_spin(window: &mut Window, cx: &mut Context<Self>) {
        let page = cx.entity().downgrade();
        let window_handle = Window::window_handle(window);
        Engine::after_spin(
            move |cx| {
                let _ = window_handle.update(cx, |_, window, cx| {
                    if let Some(page) = page.upgrade() {
                        page.update(cx, |page, cx| page.drain(window, cx));
                    }
                });
            },
            cx,
        );
    }

    fn crashed(&mut self, reason: &str, window: &mut Window, cx: &mut Context<Self>) {
        if !self.controls.begin_dialog() {
            return;
        }
        let answer = window.prompt(
            gpui_kit::PromptLevel::Critical,
            "Theorem's page stopped working.",
            Some(reason),
            &["Reload"],
            cx,
        );
        cx.spawn(async move |page, cx| {
            let _ = answer.await;
            let _ = page.update(cx, |page, _| {
                page.controls.end_dialog();
                page.webview.reload();
            });
        })
        .detach();
    }

    // Keyboard.

    /// Keys reach the page before GPUI's key bindings, so the page can use
    /// any shortcut it wants; `input_handled` hands back the ones it did not.
    fn intercept_keys(
        replaying: Rc<Cell<bool>>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Subscription {
        let page = cx.entity().downgrade();
        let window_handle = Window::window_handle(window);
        cx.intercept_keystrokes(move |event, window, cx| {
            if replaying.get() || Window::window_handle(window) != window_handle {
                return;
            }
            let Some(page) = page.upgrade() else {
                return;
            };
            if page.update(cx, |page, cx| page.key_down(&event.keystroke, window, cx)) {
                cx.stop_propagation();
            }
        })
    }

    fn key_down(&mut self, keystroke: &Keystroke, window: &mut Window, cx: &mut App) -> bool {
        if !self.focus_handle.is_focused(window) {
            return false;
        }
        self.controls.dismiss_menus();
        let shortcut = keystroke.modifiers.platform || keystroke.modifiers.control;
        // macOS sends no key-up for a key pressed with Command, so those
        // never count as held.
        let repeat = !shortcut && !self.held.insert(keystroke.key.clone());
        let event = keys::keyboard_event(keystroke, KeyState::Down, repeat);
        let id = self.send(InputEvent::Keyboard(event));
        if shortcut {
            self.shortcuts.insert(id, keystroke.clone());
        }
        let _ = cx;
        true
    }

    fn key_up(&mut self, event: &KeyUpEvent, window: &mut Window, _: &mut Context<Self>) {
        if !self.focus_handle.is_focused(window) {
            return;
        }
        self.held.remove(&event.keystroke.key);
        let event = keys::keyboard_event(&event.keystroke, KeyState::Up, false);
        self.send(InputEvent::Keyboard(event));
    }

    fn modifiers_changed(&mut self, event: &ModifiersChangedEvent, window: &mut Window) {
        if !self.focus_handle.is_focused(window) {
            return;
        }
        for event in keys::modifier_events(&self.modifiers, &event.modifiers) {
            self.send(InputEvent::Keyboard(event));
        }
        self.modifiers = event.modifiers;
    }

    fn input_handled(
        &mut self,
        id: InputEventId,
        result: InputEventResult,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(keystroke) = self.shortcuts.remove(&id) else {
            return;
        };
        if result.intersects(InputEventResult::Consumed | InputEventResult::DefaultPrevented) {
            return;
        }
        let replaying = self.replaying.clone();
        window.defer(cx, move |window, cx| {
            replaying.set(true);
            window.dispatch_keystroke(keystroke, cx);
            replaying.set(false);
        });
    }

    /// The Edit menu. Servo has editing actions for the clipboard; the rest
    /// reach the page as the shortcut they stand for.
    fn editing(&mut self, action: ClipboardAction) {
        self.send(InputEvent::EditingAction(action));
    }

    fn shortcut(&mut self, key: &str, shift: bool) {
        // A replayed shortcut already went to the page and was not used.
        if self.replaying.get() {
            return;
        }
        let keystroke = Keystroke {
            modifiers: gpui_kit::Modifiers {
                platform: true,
                shift,
                ..Default::default()
            },
            key: key.into(),
            key_char: None,
        };
        for state in [KeyState::Down, KeyState::Up] {
            self.send(InputEvent::Keyboard(keys::keyboard_event(
                &keystroke, state, false,
            )));
        }
    }

    // Pointer.

    fn device_point(&self, position: Point<Pixels>) -> Option<DevicePoint> {
        let origin = self.bounds?.origin;
        Some(DevicePoint::new(
            f32::from(position.x - origin.x) * self.scale,
            f32::from(position.y - origin.y) * self.scale,
        ))
    }

    fn mouse_down(&mut self, event: &MouseDownEvent, window: &mut Window, cx: &mut Context<Self>) {
        let Some(point) = self.device_point(event.position) else {
            return;
        };
        self.controls.dismiss_menus();
        window.focus(&self.focus_handle, cx);
        if !self.pressed.contains(&event.button) {
            self.pressed.push(event.button);
        }
        self.last_pointer = Some(event.position);
        self.send(InputEvent::MouseButton(MouseButtonEvent::new(
            MouseButtonAction::Down,
            servo_button(event.button),
            point.into(),
        )));
        cx.stop_propagation();
    }

    fn mouse_up(&mut self, event: &MouseUpEvent, _: &mut Window, cx: &mut Context<Self>) {
        let Some(index) = self.pressed.iter().position(|b| *b == event.button) else {
            return;
        };
        self.pressed.remove(index);
        if let Some(point) = self.device_point(event.position) {
            self.send(InputEvent::MouseButton(MouseButtonEvent::new(
                MouseButtonAction::Up,
                servo_button(event.button),
                point.into(),
            )));
        }
        cx.stop_propagation();
    }

    /// Buttons still down when the page loses focus would stay down in the
    /// page; release them where the pointer was last seen.
    fn release_buttons(&mut self) {
        let Some(point) = self.last_pointer.and_then(|p| self.device_point(p)) else {
            self.pressed.clear();
            return;
        };
        for button in std::mem::take(&mut self.pressed) {
            self.send(InputEvent::MouseButton(MouseButtonEvent::new(
                MouseButtonAction::Up,
                servo_button(button),
                point.into(),
            )));
        }
    }

    fn mouse_move(&mut self, event: &MouseMoveEvent, _: &mut Window, cx: &mut Context<Self>) {
        if let Some(point) = self.device_point(event.position) {
            self.last_pointer = Some(event.position);
            self.send(InputEvent::MouseMove(ServoMouseMove::new(point.into())));
            cx.stop_propagation();
        }
    }

    fn mouse_exit(&mut self, _: &MouseExitEvent, _: &mut Window, _: &mut Context<Self>) {
        self.send(InputEvent::MouseLeftViewport(
            MouseLeftViewportEvent::default(),
        ));
    }

    fn scroll(&mut self, event: &ScrollWheelEvent, _: &mut Window, cx: &mut Context<Self>) {
        let Some(point) = self.device_point(event.position) else {
            return;
        };
        let (x, y) = match event.delta {
            ScrollDelta::Pixels(delta) => (
                f64::from(f32::from(delta.x) * self.scale),
                f64::from(f32::from(delta.y) * self.scale),
            ),
            ScrollDelta::Lines(delta) => (
                f64::from(delta.x) * LINE_HEIGHT,
                f64::from(delta.y) * LINE_HEIGHT,
            ),
        };
        let delta = WheelDelta {
            x,
            y,
            z: 0.0,
            mode: WheelMode::DeltaPixel,
        };
        self.send(InputEvent::Wheel(WheelEvent::new(delta, point.into())));
        cx.stop_propagation();
    }

    fn pinch(&mut self, event: &PinchEvent, _: &mut Window, cx: &mut Context<Self>) {
        if let Some(center) = self.device_point(event.position) {
            self.webview.adjust_pinch_zoom(1.0 + event.delta, center);
            cx.stop_propagation();
        }
    }

    /// Move the child view and the web view to where the page was laid out.
    fn place(&mut self, bounds: Bounds<Pixels>, scale: f32) {
        if self.bounds == Some(bounds) && self.scale == scale {
            return;
        }
        let placement = physical(bounds, scale);
        if let Err(error) = self.surface.apply(placement) {
            log::error!("placing the page: {error}");
        }
        if self.scale != scale {
            self.webview.set_hidpi_scale_factor(Scale::new(scale));
        }
        self.webview.resize(placement.physical_size());
        self.bounds = Some(bounds);
        self.scale = scale;
    }

    // Input method.

    fn compose(&mut self, state: CompositionState, data: &str) {
        self.send(InputEvent::Ime(ImeEvent::Composition(CompositionEvent {
            state,
            data: data.to_owned(),
        })));
    }

    fn commit(&mut self, text: &str) {
        if self.marked.take().is_none() {
            self.compose(CompositionState::Start, "");
        }
        self.compose(CompositionState::End, text);
    }
}

/// Physical placement of a rectangle in window points.
fn physical(bounds: Bounds<Pixels>, scale: f32) -> webview_surface::Bounds {
    webview_surface::Bounds::new(
        (f32::from(bounds.origin.x) * scale).round() as i32,
        (f32::from(bounds.origin.y) * scale).round() as i32,
        (f32::from(bounds.size.width) * scale).round().max(1.0) as u32,
        (f32::from(bounds.size.height) * scale).round().max(1.0) as u32,
    )
}

fn theme(appearance: WindowAppearance) -> Theme {
    match appearance {
        WindowAppearance::Dark | WindowAppearance::VibrantDark => Theme::Dark,
        WindowAppearance::Light | WindowAppearance::VibrantLight => Theme::Light,
    }
}

fn servo_button(button: GpuiButton) -> ServoButton {
    match button {
        GpuiButton::Left => ServoButton::Primary,
        GpuiButton::Middle => ServoButton::Auxiliary,
        GpuiButton::Right => ServoButton::Secondary,
        GpuiButton::Navigate(NavigationDirection::Back) => ServoButton::Back,
        GpuiButton::Navigate(NavigationDirection::Forward) => ServoButton::Forward,
    }
}

/// The page's CSS cursor as the closest macOS cursor.
fn cursor_style(cursor: Cursor) -> CursorStyle {
    match cursor {
        Cursor::Pointer => CursorStyle::PointingHand,
        Cursor::Text => CursorStyle::IBeam,
        Cursor::VerticalText => CursorStyle::IBeamCursorForVerticalLayout,
        Cursor::Crosshair | Cursor::Cell => CursorStyle::Crosshair,
        Cursor::ContextMenu => CursorStyle::ContextualMenu,
        Cursor::Alias => CursorStyle::DragLink,
        Cursor::Copy => CursorStyle::DragCopy,
        Cursor::NoDrop | Cursor::NotAllowed => CursorStyle::OperationNotAllowed,
        Cursor::Grab | Cursor::Move | Cursor::AllScroll => CursorStyle::OpenHand,
        Cursor::Grabbing => CursorStyle::ClosedHand,
        Cursor::EResize => CursorStyle::ResizeRight,
        Cursor::WResize => CursorStyle::ResizeLeft,
        Cursor::EwResize | Cursor::ColResize => CursorStyle::ResizeColumn,
        Cursor::NResize => CursorStyle::ResizeUp,
        Cursor::SResize => CursorStyle::ResizeDown,
        Cursor::NsResize | Cursor::RowResize => CursorStyle::ResizeRow,
        Cursor::NeResize | Cursor::SwResize | Cursor::NeswResize => {
            CursorStyle::ResizeUpRightDownLeft
        }
        Cursor::NwResize | Cursor::SeResize | Cursor::NwseResize => {
            CursorStyle::ResizeUpLeftDownRight
        }
        Cursor::None
        | Cursor::Default
        | Cursor::Help
        | Cursor::Progress
        | Cursor::Wait
        | Cursor::ZoomIn
        | Cursor::ZoomOut => CursorStyle::Arrow,
    }
}

impl Focusable for PageView {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

impl Render for PageView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let page = cx.entity();
        let placed = page.downgrade();
        let focus_handle = self.focus_handle.clone();
        div()
            .id("page")
            .key_context(CONTEXT)
            .track_focus(&self.focus_handle)
            .size_full()
            .cursor(self.cursor)
            .on_any_mouse_down(cx.listener(Self::mouse_down))
            .capture_any_mouse_up(cx.listener(Self::mouse_up))
            .on_mouse_up_out(GpuiButton::Left, cx.listener(Self::mouse_up))
            .on_mouse_up_out(GpuiButton::Right, cx.listener(Self::mouse_up))
            .on_mouse_up_out(GpuiButton::Middle, cx.listener(Self::mouse_up))
            .on_mouse_move(cx.listener(Self::mouse_move))
            .on_mouse_exit(cx.listener(Self::mouse_exit))
            .on_scroll_wheel(cx.listener(Self::scroll))
            .on_pinch(cx.listener(Self::pinch))
            .on_key_up(cx.listener(Self::key_up))
            .on_modifiers_changed(cx.listener(|page, event, window, _| {
                page.modifiers_changed(event, window)
            }))
            .on_action(cx.listener(|page, _: &Copy, _, _| page.editing(ClipboardAction::Copy)))
            .on_action(cx.listener(|page, _: &Cut, _, _| page.editing(ClipboardAction::Cut)))
            .on_action(cx.listener(|page, _: &Paste, _, _| page.editing(ClipboardAction::Paste)))
            .on_action(cx.listener(|page, _: &SelectAll, _, _| page.shortcut("a", false)))
            .on_action(cx.listener(|page, _: &Undo, _, _| page.shortcut("z", false)))
            .on_action(cx.listener(|page, _: &Redo, _, _| page.shortcut("z", true)))
            .on_action(cx.listener(Self::pick_option))
            .on_action(cx.listener(Self::pick_context_action))
            .child(
                canvas(
                    move |bounds, window, cx| {
                        let scale = window.scale_factor();
                        let _ = placed.update(cx, |page, _| page.place(bounds, scale));
                    },
                    move |bounds, (), window, cx| {
                        // The input method talks to the focused page through
                        // this handler, registered anew each frame.
                        window.handle_input(
                            &focus_handle,
                            ElementInputHandler::new(bounds, page),
                            cx,
                        );
                    },
                )
                .size_full(),
            )
    }
}

impl EntityInputHandler for PageView {
    fn text_for_range(
        &mut self,
        range: Range<usize>,
        adjusted: &mut Option<Range<usize>>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<String> {
        let utf16: Vec<u16> = self.marked.as_deref()?.encode_utf16().collect();
        let start = range.start.min(utf16.len());
        let end = range.end.clamp(start, utf16.len());
        *adjusted = Some(start..end);
        Some(String::from_utf16_lossy(&utf16[start..end]))
    }

    fn selected_text_range(
        &mut self,
        _: bool,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<UTF16Selection> {
        let end = self.marked.as_deref().map_or(0, |text| text.encode_utf16().count());
        Some(UTF16Selection {
            range: end..end,
            reversed: false,
        })
    }

    fn marked_text_range(&self, _: &mut Window, _: &mut Context<Self>) -> Option<Range<usize>> {
        self.marked
            .as_deref()
            .map(|text| 0..text.encode_utf16().count())
    }

    /// AppKit unmarks by keeping the marked text, so it is committed.
    fn unmark_text(&mut self, _: &mut Window, _: &mut Context<Self>) {
        if let Some(text) = self.marked.clone() {
            self.commit(&text);
        }
    }

    fn replace_text_in_range(
        &mut self,
        _: Option<Range<usize>>,
        text: &str,
        _: &mut Window,
        _: &mut Context<Self>,
    ) {
        self.commit(text);
    }

    fn replace_and_mark_text_in_range(
        &mut self,
        _: Option<Range<usize>>,
        text: &str,
        _: Option<Range<usize>>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) {
        if text.is_empty() {
            // The person deleted the whole composition.
            if self.marked.take().is_some() {
                self.compose(CompositionState::End, "");
            }
            return;
        }
        if self.marked.is_none() {
            self.compose(CompositionState::Start, "");
        }
        self.compose(CompositionState::Update, text);
        self.marked = Some(text.to_owned());
    }

    /// Where the candidate window goes: under the focused field, as Servo
    /// reports it, else under the pointer.
    fn bounds_for_range(
        &mut self,
        _: Range<usize>,
        element: Bounds<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        if let Some(control) = &self.input_method {
            let rect = control.position();
            let origin = point(
                element.origin.x + px(rect.min.x as f32 / self.scale),
                element.origin.y + px(rect.min.y as f32 / self.scale),
            );
            let extent = size(
                px(rect.width() as f32 / self.scale),
                px(rect.height() as f32 / self.scale),
            );
            return Some(Bounds::new(origin, extent));
        }
        let pointer = self.last_pointer?;
        Some(Bounds::new(pointer, size(px(1.), px(16.))))
    }

    fn character_index_for_point(
        &mut self,
        _: Point<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<usize> {
        None
    }
}
