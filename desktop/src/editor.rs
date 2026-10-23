//! `openNativeEditor`: a file from a granted folder in its own window, edited
//! with GPUI Kit's code editor (plan D5). Saving writes the file and tells the
//! page through the server's event stream.
//!
//! SOURCING: GPUI Kit `Editor` / `EditorState` (syntect highlighting) and
//! GPUI's native prompt for unsaved changes.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use gpui_kit::component::input::{Editor, EditorState, InputEvent};
use gpui_kit::component::{ActiveTheme as _, Root};
use gpui_kit::{
    AnyWindowHandle, App, AppContext as _, Context, Entity, Global, InteractiveElement as _,
    IntoElement, ParentElement as _, PromptLevel, Render, SharedString, Styled as _, Subscription,
    TitlebarOptions, Window, WindowBounds, WindowOptions, actions, div, px, size,
};
use theorem_desktop_protocol::HostEvent;

use crate::bridge::Host;

actions!(file_editor, [Save]);

pub const CONTEXT: &str = "FileEditor";

/// One window per file: opening a file that is already open brings it forward.
#[derive(Default)]
struct OpenEditors(HashMap<PathBuf, AnyWindowHandle>);

impl Global for OpenEditors {}

pub fn open(path: PathBuf, cx: &mut App) -> anyhow::Result<()> {
    let existing = cx.default_global::<OpenEditors>().0.get(&path).copied();
    if let Some(window) = existing
        && window
            .update(cx, |_, window, _| window.activate_window())
            .is_ok()
    {
        return Ok(());
    }
    let text = std::fs::read_to_string(&path)?;
    let title: SharedString = path
        .file_name()
        .map_or_else(|| path.display().to_string(), |name| name.to_string_lossy().into())
        .into();
    let options = WindowOptions {
        titlebar: Some(TitlebarOptions {
            title: Some(title),
            ..Default::default()
        }),
        window_bounds: Some(WindowBounds::centered(size(px(860.), px(720.)), cx)),
        ..Default::default()
    };
    let key = path.clone();
    let window = cx.open_window(options, move |window, cx| {
        let view = cx.new(|cx| FileEditor::new(path, text, window, cx));
        cx.new(|cx| Root::new(view, window, cx))
    })?;
    cx.default_global::<OpenEditors>().0.insert(key, window.into());
    Ok(())
}

struct FileEditor {
    path: PathBuf,
    editor: Entity<EditorState>,
    /// The text as last read or written, to tell whether there is anything to save.
    saved: SharedString,
    _changes: Subscription,
}

impl FileEditor {
    fn new(path: PathBuf, text: String, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let language = language(&path);
        let editor = cx.new(|cx| {
            EditorState::new(window, cx)
                .language(language)
                .soft_wrap(true)
                .default_value(text.clone())
        });
        editor.update(cx, |editor, cx| editor.focus(window, cx));
        let changes = cx.subscribe_in(&editor, window, |this, _, event, window, cx| {
            if matches!(event, InputEvent::Change) {
                window.set_window_edited(this.edited(cx));
            }
        });
        let this = cx.entity().downgrade();
        window.on_window_should_close(cx, move |window, cx| {
            this.update(cx, |this, cx| this.should_close(window, cx))
                .unwrap_or(true)
        });
        Self {
            path,
            editor,
            saved: text.into(),
            _changes: changes,
        }
    }

    fn edited(&self, cx: &App) -> bool {
        self.editor.read(cx).value() != self.saved
    }

    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) -> bool {
        let text = self.editor.read(cx).value();
        if let Err(error) = std::fs::write(&self.path, text.as_bytes()) {
            let message = format!("Theorem could not save {}.", self.path.display());
            let _ = window.prompt(
                PromptLevel::Critical,
                &message,
                Some(&error.to_string()),
                &["OK"],
                cx,
            );
            return false;
        }
        self.saved = text;
        window.set_window_edited(false);
        Host::event(
            HostEvent::FileSaved {
                path: self.path.to_string_lossy().into(),
            },
            cx,
        );
        true
    }

    /// Closing with unsaved changes asks first, as every Mac editor does.
    fn should_close(&mut self, window: &mut Window, cx: &mut Context<Self>) -> bool {
        if !self.edited(cx) {
            self.forget(cx);
            return true;
        }
        let name = self
            .path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        let answer = window.prompt(
            PromptLevel::Warning,
            &format!("Save the changes to {name}?"),
            Some("Your changes are lost if you close without saving."),
            &["Save", "Don't Save", "Cancel"],
            cx,
        );
        cx.spawn_in(window, async move |this, cx| {
            let close = match answer.await {
                Ok(0) => this
                    .update_in(cx, |this, window, cx| this.save(window, cx))
                    .unwrap_or(false),
                Ok(1) => true,
                _ => false,
            };
            if close {
                let _ = this.update_in(cx, |this, window, cx| {
                    this.forget(cx);
                    window.remove_window();
                });
            }
        })
        .detach();
        false
    }

    fn forget(&self, cx: &mut App) {
        cx.default_global::<OpenEditors>().0.remove(&self.path);
    }
}

/// The syntect language for a file, by extension.
fn language(path: &Path) -> String {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("md" | "markdown") => "markdown".into(),
        Some(ext) => ext.to_ascii_lowercase(),
        None => "text".into(),
    }
}

impl Render for FileEditor {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .key_context(CONTEXT)
            .on_action(cx.listener(|this, _: &Save, window, cx| {
                this.save(window, cx);
            }))
            .size_full()
            .bg(cx.theme().background)
            .child(Editor::new(&self.editor).bordered(false).h_full())
    }
}
