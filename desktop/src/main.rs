//! Theorem UI's desktop app (plan D1–D5): one GPUI Kit window showing the
//! React app in Servo, served by the app's own server running as a child
//! process on loopback.

// The `Action` derive names its crate `gpui`.
extern crate gpui_kit as gpui;

mod bridge;
mod capture;
mod controls;
mod delegate;
mod editor;
mod engine;
mod keys;
mod page;
mod server;

use anyhow::Context as _;
use gpui_kit::component::Root;
use gpui_kit::component::input::{Copy, Cut, Paste, Redo, SelectAll, Undo};
use gpui_kit::{
    AnyView, App, AppContext as _, EmptyView, Focusable as _, KeyBinding, Menu, MenuItem, OsAction, TitlebarOptions,
    WindowBounds, WindowOptions, actions, px, size,
};

use crate::bridge::Host;
use crate::engine::Engine;
use crate::page::PageView;
use crate::server::ServerConfig;

actions!(theorem, [Quit]);

fn main() -> anyhow::Result<()> {
    // Logging is Servo's (`Engine::start`): it installs the one logger, which
    // also forwards to the constellation, and reads `RUST_LOG`.
    // Servo's networking and the rest of the graph link more than one rustls
    // provider, so one has to be named before the first TLS connection.
    let _ = rustls::crypto::ring::default_provider().install_default();

    let data_dir = dirs::data_dir()
        .context("no application data directory")?
        .join("Theorem");
    let profile_dir = data_dir.join("profile");
    let server_dir = data_dir.join("server");
    std::fs::create_dir_all(&profile_dir)?;
    std::fs::create_dir_all(&server_dir)?;
    let config = ServerConfig::resolve(server_dir)?;

    gpui_kit::application()
        .with_assets(gpui_kit::assets::Assets)
        .run(move |cx| {
            gpui_kit::init(cx);
            install_menus(cx);
            Engine::start(&profile_dir, cx);
            if let Err(error) = open_main_window(config, cx) {
                log::error!("{error:#}");
                cx.quit();
            }
        });
    Ok(())
}

fn install_menus(cx: &mut App) {
    cx.on_action(|_: &Quit, cx| cx.quit());
    cx.bind_keys([
        KeyBinding::new("cmd-q", Quit, None),
        KeyBinding::new("cmd-z", Undo, Some(page::CONTEXT)),
        KeyBinding::new("cmd-shift-z", Redo, Some(page::CONTEXT)),
        KeyBinding::new("cmd-x", Cut, Some(page::CONTEXT)),
        KeyBinding::new("cmd-c", Copy, Some(page::CONTEXT)),
        KeyBinding::new("cmd-v", Paste, Some(page::CONTEXT)),
        KeyBinding::new("cmd-a", SelectAll, Some(page::CONTEXT)),
        KeyBinding::new("cmd-s", editor::Save, Some(editor::CONTEXT)),
    ]);
    cx.set_menus([
        Menu::new("Theorem").items([MenuItem::action("Quit Theorem", Quit)]),
        Menu::new("File").items([MenuItem::action("Save", editor::Save)]),
        Menu::new("Edit").items([
            MenuItem::os_action("Undo", Undo, OsAction::Undo),
            MenuItem::os_action("Redo", Redo, OsAction::Redo),
            MenuItem::separator(),
            MenuItem::os_action("Cut", Cut, OsAction::Cut),
            MenuItem::os_action("Copy", Copy, OsAction::Copy),
            MenuItem::os_action("Paste", Paste, OsAction::Paste),
            MenuItem::os_action("Select All", SelectAll, OsAction::SelectAll),
        ]),
    ]);
}

fn open_main_window(config: ServerConfig, cx: &mut App) -> anyhow::Result<()> {
    let options = WindowOptions {
        titlebar: Some(TitlebarOptions {
            title: Some("Theorem".into()),
            ..Default::default()
        }),
        window_bounds: Some(WindowBounds::centered(size(px(1280.), px(820.)), cx)),
        ..Default::default()
    };
    let mut page = None;
    let mut failure = None;
    let window = cx.open_window(options, |window, cx| {
        let view: AnyView = match PageView::new(window, cx) {
            Ok(view) => {
                window.focus(&view.focus_handle(cx), cx);
                page = Some(view.clone());
                view.into()
            }
            Err(error) => {
                failure = Some(error);
                cx.new(|_| EmptyView).into()
            }
        };
        cx.new(|cx| Root::new(view, window, cx))
    })?;
    if let Some(error) = failure {
        return Err(error.context("starting the page"));
    }
    let page = page.context("the page view")?;
    let window = window.into();
    // The app's only main window: closing it quits.
    cx.on_window_closed(move |cx, _| {
        if cx.windows().iter().all(|open| *open != window) {
            cx.quit();
        }
    })
    .detach();
    Host::start(config, page.downgrade(), window, cx);
    Ok(())
}
