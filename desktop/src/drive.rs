//! Checking the app from a shell or CI, where nothing may screenshot or click
//! the window.
//!
//! - `THEOREM_CAPTURE=<file.png>`: once the session has had time to load,
//!   save what the page shows, and its title, URL and text beside it as
//!   `<file>.json`. `THEOREM_CAPTURE_SCRIPT=<file.js>` runs a script first.
//!   Servo does not wait for promises, so the script stores its findings in
//!   `window.theoremCapture`, which the JSON includes a few seconds later.
//! - `THEOREM_DRIVE=<steps.json>`: run a list of [`Step`]s in order, then write
//!   `report.json` with each step's value or error beside the steps file, or
//!   in `THEOREM_DRIVE_OUT`. Input goes through GPUI's own dispatch, as though
//!   the platform delivered it, so it crosses the whole embedder layer. What
//!   it skips is AppKit: the child view's hit testing and the real input
//!   method's key handling.
//!
//! SOURCING: Servo's `WebView::take_screenshot` and `evaluate_javascript`;
//! GPUI's `Window::dispatch_event` and `dispatch_keystroke`; serde for the
//! steps. The step list itself is ours: no crate drives a GPUI window that
//! hosts Servo.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures::channel::oneshot;
use gpui_kit::{
    AnyWindowHandle, App, AsyncApp, EntityInputHandler as _, KeyUpEvent, Keystroke, Modifiers,
    MouseButton, MouseDownEvent, MouseMoveEvent, MouseUpEvent, Pixels, PlatformInput, Point,
    ScrollDelta, ScrollWheelEvent, TouchPhase, WeakEntity, point, px,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use servo::{JSValue, WebView};

use crate::bridge::Host;
use crate::page::PageView;

const SETTLE: Duration = Duration::from_secs(10);
const SCRIPT_TIME: Duration = Duration::from_secs(6);
/// Time for the page to act on one input step before the next.
const INPUT_SETTLE: Duration = Duration::from_millis(150);
/// Between the moves of a drag, about one frame.
const DRAG_FRAME: Duration = Duration::from_millis(16);
const POLL: Duration = Duration::from_millis(250);

/// Scrolls an element into view and gives its center, or null.
const CENTER: &str = "(e => { if (!e) return null; \
    e.scrollIntoView({ block: 'center', inline: 'center' }); \
    const r = e.getBoundingClientRect(); \
    return [r.left + r.width / 2, r.top + r.height / 2] })";

/// The innermost visible element whose whole text is the given text.
const INNERMOST_WITH_TEXT: &str = "(text => [...document.querySelectorAll('body *')].find(e => \
    e.textContent.trim() === text \
    && ![...e.children].some(c => c.textContent.trim() === text) \
    && e.getClientRects().length > 0))";

const DESCRIBE: &str = "JSON.stringify({
    title: document.title,
    url: location.href,
    text: document.body ? document.body.innerText.slice(0, 4000) : null,
    script: window.theoremCapture ?? null,
}, null, 2)";

/// One step of a `THEOREM_DRIVE` script, written in JSON as
/// `{"click": "textarea"}`, `{"type": "hello"}`, `"quit"` and so on.
///
/// A target is `[x, y]` in CSS pixels from the page's corner, or a string:
/// - a CSS selector, whose first match is scrolled into view and pressed in
///   its center;
/// - `text=<text>`, the innermost visible element whose text is exactly that;
/// - `js=<expression>`, a script whose value is `[x, y]`.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Step {
    /// Pause, in milliseconds.
    Wait(u64),
    /// Evaluate a script and record its value.
    Js(String),
    /// Poll a script until its value is truthy.
    Until {
        js: String,
        /// Milliseconds before giving up.
        #[serde(default = "Step::default_timeout")]
        timeout: u64,
    },
    Click(Target),
    DoubleClick(Target),
    /// Press at `from`, move to `to` in `moves` steps, and release.
    Drag {
        from: Target,
        to: Target,
        #[serde(default = "Step::default_moves")]
        moves: u32,
    },
    /// Turn the wheel at a target by `[x, y]` pixels.
    Scroll {
        at: Target,
        by: [f32; 2],
    },
    /// A keystroke in GPUI's syntax: `enter`, `cmd-a`, `shift-tab`.
    Key(String),
    /// Type text one character at a time.
    Type(String),
    /// Mark text with the input method, as a composition in progress.
    Compose(String),
    /// Commit text from the input method, ending any composition.
    Commit(String),
    /// Save `<name>.png` and `<name>.json`, as `THEOREM_CAPTURE` does.
    Capture(String),
    /// Quit as Cmd-Q does: once the page has saved.
    Quit,
}

impl Step {
    fn default_timeout() -> u64 {
        15_000
    }

    fn default_moves() -> u32 {
        12
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum Target {
    Point([f32; 2]),
    Selector(String),
}

pub fn after_load(page: WeakEntity<PageView>, window: AnyWindowHandle, cx: &mut App) {
    let script = match script() {
        Ok(Some(script)) => script,
        Ok(None) => return,
        Err(error) => {
            log::error!("drive: {error:#}");
            return;
        }
    };
    let driver = Driver {
        page,
        window,
        out: script.out,
    };
    cx.spawn(async move |cx: &mut AsyncApp| driver.run(script.steps, script.report, cx).await)
        .detach();
}

struct Script {
    steps: Vec<Step>,
    out: PathBuf,
    report: Option<PathBuf>,
}

fn script() -> anyhow::Result<Option<Script>> {
    if let Some(file) = std::env::var_os("THEOREM_DRIVE").map(PathBuf::from) {
        let steps = serde_json::from_slice(&std::fs::read(&file)?)?;
        let out = std::env::var_os("THEOREM_DRIVE_OUT")
            .map(PathBuf::from)
            .unwrap_or_else(|| parent(&file));
        std::fs::create_dir_all(&out)?;
        let report = Some(out.join("report.json"));
        return Ok(Some(Script { steps, out, report }));
    }
    let Some(png) = std::env::var_os("THEOREM_CAPTURE").map(PathBuf::from) else {
        return Ok(None);
    };
    let mut steps = vec![Step::Wait(SETTLE.as_millis() as u64)];
    if let Some(file) = std::env::var_os("THEOREM_CAPTURE_SCRIPT") {
        let script = std::fs::read_to_string(&file)
            .unwrap_or_else(|error| format!("window.theoremCapture = {:?}", error.to_string()));
        steps.push(Step::Js(script));
        steps.push(Step::Wait(SCRIPT_TIME.as_millis() as u64));
    }
    let name = png
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned());
    steps.push(Step::Capture(name.unwrap_or_else(|| "capture".into())));
    Ok(Some(Script {
        steps,
        out: parent(&png),
        report: None,
    }))
}

fn parent(file: &Path) -> PathBuf {
    file.parent()
        .map_or_else(|| PathBuf::from("."), Path::to_path_buf)
}

#[derive(Serialize)]
struct Outcome {
    step: Step,
    ms: u128,
    #[serde(skip_serializing_if = "Value::is_null")]
    value: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

struct Driver {
    page: WeakEntity<PageView>,
    window: AnyWindowHandle,
    out: PathBuf,
}

type StepResult = Result<Value, String>;

impl Driver {
    async fn run(&self, steps: Vec<Step>, report: Option<PathBuf>, cx: &mut AsyncApp) {
        let mut outcomes = Vec::new();
        for step in steps {
            let started = Instant::now();
            let result = self.step(&step, cx).await;
            if let Err(error) = &result {
                log::error!("drive: {step:?}: {error}");
            }
            let (value, error) = match result {
                Ok(value) => (value, None),
                Err(error) => (Value::Null, Some(error)),
            };
            outcomes.push(Outcome {
                step,
                ms: started.elapsed().as_millis(),
                value,
                error,
            });
            // Written after every step, so a crash still leaves what ran.
            if let Some(report) = &report
                && let Err(error) = serde_json::to_vec_pretty(&outcomes)
                    .map_err(anyhow::Error::from)
                    .and_then(|bytes| Ok(std::fs::write(report, bytes)?))
            {
                log::error!("drive: writing {}: {error}", report.display());
            }
        }
    }

    async fn step(&self, step: &Step, cx: &mut AsyncApp) -> StepResult {
        match step {
            Step::Wait(ms) => {
                self.sleep(Duration::from_millis(*ms), cx).await;
                Ok(Value::Null)
            }
            Step::Js(script) => self.eval(script, cx).await,
            Step::Until { js, timeout } => {
                let deadline = Instant::now() + Duration::from_millis(*timeout);
                loop {
                    let value = self.eval(js, cx).await?;
                    if truthy(&value) {
                        return Ok(value);
                    }
                    if Instant::now() >= deadline {
                        return Err(format!("still {value} after {timeout} ms"));
                    }
                    self.sleep(POLL, cx).await;
                }
            }
            Step::Click(target) => {
                let at = self.locate(target, cx).await?;
                self.input(click(at, 1), cx).await
            }
            Step::DoubleClick(target) => {
                let at = self.locate(target, cx).await?;
                let mut events = click(at, 1);
                events.extend(click(at, 2));
                self.input(events, cx).await
            }
            Step::Drag { from, to, moves } => {
                let (from, to) = (self.locate(from, cx).await?, self.locate(to, cx).await?);
                self.input(press(from, 1), cx).await?;
                for move_index in 1..=*moves {
                    let t = move_index as f32 / *moves as f32;
                    let at = point(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
                    self.dispatch(vec![mouse_move(at, Some(MouseButton::Left))], cx)?;
                    self.sleep(DRAG_FRAME, cx).await;
                }
                self.input(vec![release(to, 1)], cx).await
            }
            Step::Scroll { at, by } => {
                let at = self.locate(at, cx).await?;
                let wheel = PlatformInput::ScrollWheel(ScrollWheelEvent {
                    position: at,
                    delta: ScrollDelta::Pixels(point(px(by[0]), px(by[1]))),
                    modifiers: Modifiers::default(),
                    touch_phase: TouchPhase::Moved,
                });
                self.input(vec![mouse_move(at, None), wheel], cx).await
            }
            Step::Key(key) => {
                let keystroke = Keystroke::parse(key).map_err(|error| error.to_string())?;
                self.keystrokes(vec![keystroke], cx).await
            }
            Step::Type(text) => self.keystrokes(text.chars().map(typed).collect(), cx).await,
            Step::Compose(text) => {
                self.with_page(cx, |page, window, cx| {
                    page.replace_and_mark_text_in_range(None, text, None, window, cx)
                })?;
                self.settled(cx).await
            }
            Step::Commit(text) => {
                self.with_page(cx, |page, window, cx| {
                    page.replace_text_in_range(None, text, window, cx)
                })?;
                self.settled(cx).await
            }
            Step::Capture(name) => self.capture(name, cx).await,
            Step::Quit => {
                cx.update(Host::quit);
                Ok(Value::Null)
            }
        }
    }

    async fn sleep(&self, duration: Duration, cx: &mut AsyncApp) {
        cx.background_executor().timer(duration).await;
    }

    async fn settled(&self, cx: &mut AsyncApp) -> StepResult {
        self.sleep(INPUT_SETTLE, cx).await;
        Ok(Value::Null)
    }

    fn webview(&self, cx: &mut AsyncApp) -> Result<WebView, String> {
        cx.update(|cx| {
            self.page
                .upgrade()
                .map(|page| page.read(cx).webview.clone())
        })
        .ok_or_else(|| "the page is gone".to_string())
    }

    async fn eval(&self, script: &str, cx: &mut AsyncApp) -> StepResult {
        let (sender, receiver) = oneshot::channel();
        self.webview(cx)?
            .evaluate_javascript(script, move |result| {
                let _ = sender.send(result);
            });
        match receiver.await {
            Ok(Ok(value)) => Ok(to_json(value)),
            Ok(Err(error)) => Err(format!("{error:?}")),
            Err(_) => Err("the page dropped the evaluation".into()),
        }
    }

    /// A target's position in window points.
    async fn locate(&self, target: &Target, cx: &mut AsyncApp) -> Result<Point<Pixels>, String> {
        let [x, y] = match target {
            Target::Point(at) => *at,
            Target::Selector(selector) => {
                let script = if let Some(expression) = selector.strip_prefix("js=") {
                    expression.to_string()
                } else {
                    let find = match selector.strip_prefix("text=") {
                        Some(text) => format!("{INNERMOST_WITH_TEXT}({})", Value::from(text)),
                        None => {
                            format!("document.querySelector({})", Value::from(selector.as_str()))
                        }
                    };
                    format!("{CENTER}({find})")
                };
                let value = self.eval(&script, cx).await?;
                serde_json::from_value(value).map_err(|_| format!("nothing matches {selector}"))?
            }
        };
        let origin = cx
            .update(|cx| self.page.upgrade().and_then(|page| page.read(cx).bounds))
            .ok_or("the page has not been laid out")?
            .origin;
        Ok(point(origin.x + px(x), origin.y + px(y)))
    }

    fn dispatch(&self, events: Vec<PlatformInput>, cx: &mut AsyncApp) -> Result<(), String> {
        cx.update(|cx| {
            self.window.update(cx, |_, window, cx| {
                for event in events {
                    window.dispatch_event(event, cx);
                }
            })
        })
        .map_err(|error| error.to_string())
    }

    async fn input(&self, events: Vec<PlatformInput>, cx: &mut AsyncApp) -> StepResult {
        self.dispatch(events, cx)?;
        self.settled(cx).await
    }

    /// Each keystroke as the platform sends it: down, with the typed text
    /// going to the input handler if nothing used the key, then up.
    async fn keystrokes(&self, keystrokes: Vec<Keystroke>, cx: &mut AsyncApp) -> StepResult {
        for keystroke in keystrokes {
            cx.update(|cx| {
                self.window.update(cx, |_, window, cx| {
                    window.dispatch_keystroke(keystroke.clone(), cx);
                    window.dispatch_event(PlatformInput::KeyUp(KeyUpEvent { keystroke }), cx);
                })
            })
            .map_err(|error| error.to_string())?;
            self.sleep(DRAG_FRAME, cx).await;
        }
        self.settled(cx).await
    }

    fn with_page(
        &self,
        cx: &mut AsyncApp,
        update: impl FnOnce(&mut PageView, &mut gpui_kit::Window, &mut gpui_kit::Context<PageView>),
    ) -> Result<(), String> {
        let page = self.page.upgrade().ok_or("the page is gone")?;
        cx.update(|cx| {
            self.window.update(cx, |_, window, cx| {
                page.update(cx, |page, cx| update(page, window, cx))
            })
        })
        .map_err(|error| error.to_string())
    }

    async fn capture(&self, name: &str, cx: &mut AsyncApp) -> StepResult {
        let png = self.out.join(format!("{name}.png"));
        let (sender, receiver) = oneshot::channel();
        let saved = png.clone();
        self.webview(cx)?.take_screenshot(None, move |image| {
            let result = image
                .map_err(|error| format!("{error:?}"))
                .and_then(|image| image.save(&saved).map_err(|error| error.to_string()));
            let _ = sender.send(result);
        });
        receiver
            .await
            .map_err(|_| "the page dropped the screenshot")??;
        let description = self.eval(DESCRIBE, cx).await?;
        let text = description
            .as_str()
            .map_or_else(|| description.to_string(), str::to_owned);
        std::fs::write(png.with_extension("json"), &text).map_err(|error| error.to_string())?;
        log::info!("captured the page to {}", png.display());
        Ok(serde_json::from_str(&text).unwrap_or(Value::String(text)))
    }
}

fn mouse_move(at: Point<Pixels>, pressed_button: Option<MouseButton>) -> PlatformInput {
    PlatformInput::MouseMove(MouseMoveEvent {
        position: at,
        pressed_button,
        modifiers: Modifiers::default(),
    })
}

fn press(at: Point<Pixels>, click_count: usize) -> Vec<PlatformInput> {
    vec![
        mouse_move(at, None),
        PlatformInput::MouseDown(MouseDownEvent {
            button: MouseButton::Left,
            position: at,
            modifiers: Modifiers::default(),
            click_count,
            first_mouse: false,
        }),
    ]
}

fn release(at: Point<Pixels>, click_count: usize) -> PlatformInput {
    PlatformInput::MouseUp(MouseUpEvent {
        button: MouseButton::Left,
        position: at,
        modifiers: Modifiers::default(),
        click_count,
    })
}

fn click(at: Point<Pixels>, click_count: usize) -> Vec<PlatformInput> {
    let mut events = press(at, click_count);
    events.push(release(at, click_count));
    events
}

/// The keystroke that types one character on a US layout.
fn typed(character: char) -> Keystroke {
    let key = match character {
        ' ' => "space".to_string(),
        '\n' => "enter".to_string(),
        '\t' => "tab".to_string(),
        other => other.to_lowercase().collect(),
    };
    Keystroke {
        modifiers: Modifiers {
            shift: character.is_uppercase(),
            ..Default::default()
        },
        key,
        key_char: (!character.is_control()).then(|| character.to_string()),
    }
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(number) => number.as_f64().is_some_and(|n| n != 0.0 && !n.is_nan()),
        Value::String(text) => !text.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

fn to_json(value: JSValue) -> Value {
    match value {
        JSValue::Undefined | JSValue::Null => Value::Null,
        JSValue::Boolean(value) => Value::Bool(value),
        JSValue::Number(number) => json!(number),
        JSValue::String(text) => Value::String(text),
        JSValue::Element(id) => json!({ "element": id }),
        JSValue::ShadowRoot(id) => json!({ "shadowRoot": id }),
        JSValue::Frame(id) => json!({ "frame": id }),
        JSValue::Window(id) => json!({ "window": id }),
        JSValue::Array(items) => Value::Array(items.into_iter().map(to_json).collect()),
        JSValue::Object(fields) => Value::Object(
            fields
                .into_iter()
                .map(|(key, value)| (key, to_json(value)))
                .collect(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steps_read_as_written() {
        let steps: Vec<Step> = serde_json::from_str(
            r#"[{"wait": 5}, {"click": "textarea"}, {"click": [10, 20]},
                {"until": {"js": "ready"}}, {"type": "Hi"}, "quit"]"#,
        )
        .unwrap();
        assert!(matches!(steps[1], Step::Click(Target::Selector(ref s)) if s == "textarea"));
        assert!(matches!(steps[2], Step::Click(Target::Point([10.0, 20.0]))));
        assert!(matches!(
            steps[3],
            Step::Until {
                timeout: 15_000,
                ..
            }
        ));
        assert!(matches!(steps[5], Step::Quit));
    }

    #[test]
    fn typing_sends_the_character_and_its_key() {
        let capital = typed('H');
        assert_eq!(
            (capital.key.as_str(), capital.key_char.as_deref()),
            ("h", Some("H"))
        );
        assert!(capital.modifiers.shift);
        assert_eq!(typed(' ').key, "space");
        assert_eq!(typed('\n').key_char, None);
    }
}
