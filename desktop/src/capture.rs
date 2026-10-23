//! `THEOREM_CAPTURE=<file.png>`: save what the page shows, and its title, URL
//! and text beside it as `<file>.json`, once the session has had time to load.
//! For checking the app from a shell or CI, where nothing may screenshot the
//! window.
//!
//! `THEOREM_CAPTURE_SCRIPT=<file.js>` runs a script in the page first. Servo
//! does not wait for promises, so the script stores its findings in
//! `window.theoremCapture`, which the JSON includes a few seconds later.
//!
//! SOURCING: Servo's `WebView::take_screenshot` and `evaluate_javascript`;
//! the `image` crate's PNG encoder.

use std::path::PathBuf;
use std::time::Duration;

use gpui_kit::{App, AsyncApp};
use servo::{JSValue, WebView};

const SETTLE: Duration = Duration::from_secs(10);
const SCRIPT_TIME: Duration = Duration::from_secs(6);

const DESCRIBE: &str = "JSON.stringify({
    title: document.title,
    url: location.href,
    text: document.body ? document.body.innerText.slice(0, 4000) : null,
    script: window.theoremCapture ?? null,
}, null, 2)";

pub fn after_load(webview: WebView, cx: &mut App) {
    let Some(png) = std::env::var_os("THEOREM_CAPTURE").map(PathBuf::from) else {
        return;
    };
    let script = std::env::var_os("THEOREM_CAPTURE_SCRIPT").map(|file| {
        std::fs::read_to_string(&file)
            .unwrap_or_else(|error| format!("window.theoremCapture = {:?}", error.to_string()))
    });
    cx.spawn(async move |cx: &mut AsyncApp| {
        cx.background_executor().timer(SETTLE).await;
        if let Some(script) = script {
            let page = webview.clone();
            cx.update(|_| {
                page.evaluate_javascript(script, |result| {
                    if let Err(error) = result {
                        log::error!("capture script: {error:?}");
                    }
                })
            });
            cx.background_executor().timer(SCRIPT_TIME).await;
        }
        cx.update(|_| capture(&webview, png));
    })
    .detach();
}

fn capture(webview: &WebView, png: PathBuf) {
    let json = png.with_extension("json");
    webview.take_screenshot(None, move |image| {
        match image
            .map_err(|error| format!("{error:?}"))
            .and_then(|image| image.save(&png).map_err(|error| error.to_string()))
        {
            Ok(()) => log::info!("captured the page to {}", png.display()),
            Err(error) => log::error!("capturing the page: {error}"),
        }
    });
    webview.evaluate_javascript(DESCRIBE, move |value| {
        let text = match value {
            Ok(JSValue::String(text)) => text,
            other => format!("{other:?}"),
        };
        if let Err(error) = std::fs::write(&json, text) {
            log::error!("writing {}: {error}", json.display());
        }
    });
}
