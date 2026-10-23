//! The host's side of the bridge (plan D5): the server's lifetime, the
//! granted folders, and the answers to the page's `HostCall`s.
//!
//! SOURCING: GPUI for the open panel, Finder, the system's default apps,
//! URLs and the edited mark; notify-rust for notifications. Grant checks and
//! restarts are ours: they are this app's policy, not something a library
//! models.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant};

use futures::StreamExt as _;
use gpui_kit::{
    AnyWindowHandle, App, AsyncApp, Global, PathPromptOptions, PromptLevel, Task, WeakEntity,
};
use serde_json::Value;
use theorem_desktop_protocol::{FolderGrant, HostCall, HostEvent, RpcError, ToHost, ToServer};
use url::Url;

use crate::{capture, editor};
use crate::page::PageView;
use crate::server::{Ports, Server, ServerConfig, new_secret};

/// A server that stayed up this long is restarted without asking when it stops.
const STABLE_RUN: Duration = Duration::from_secs(30);

pub struct Host {
    config: ServerConfig,
    grants: Vec<FolderGrant>,
    server: Option<Server>,
    page: WeakEntity<PageView>,
    window: AnyWindowHandle,
    /// When the current server said `ready`.
    ready_at: Option<Instant>,
    quitting: bool,
}

impl Global for Host {}

impl Host {
    pub fn start(
        config: ServerConfig,
        page: WeakEntity<PageView>,
        window: AnyWindowHandle,
        cx: &mut App,
    ) {
        let grants = load_grants(&grants_file(&config));
        cx.set_global(Host {
            config,
            grants,
            server: None,
            page,
            window,
            ready_at: None,
            quitting: false,
        });
        cx.on_app_quit(|cx| {
            // Closing stdin is the server's signal to shut down gracefully.
            let host = cx.global_mut::<Host>();
            host.quitting = true;
            host.server = None;
            async {}
        })
        .detach();
        Self::launch(cx);
    }

    fn launch(cx: &mut App) {
        if let Err(error) = Self::try_launch(cx) {
            log::error!("local server: {error:#}");
            Self::stopped(&format!("{error:#}"), cx);
        }
    }

    fn try_launch(cx: &mut App) -> anyhow::Result<()> {
        let host = cx.global_mut::<Host>();
        let ports = Ports::load_or_pick(&host.config.data_dir.join("ports.json"))?;
        let secret = new_secret()?;
        let hello = ToServer::Hello {
            secret: secret.clone(),
            grants: host.grants.clone(),
        };
        let (server, mut messages) = Server::spawn(&host.config, ports, &hello)?;
        host.server = Some(server);
        host.ready_at = None;
        cx.spawn(async move |cx: &mut AsyncApp| {
            while let Some(message) = messages.next().await {
                cx.update(|cx| Self::receive(message, &secret, cx));
            }
            cx.update(Self::exited);
        })
        .detach();
        Ok(())
    }

    fn receive(message: ToHost, secret: &str, cx: &mut App) {
        match message {
            ToHost::Ready { port, block_port } => {
                let host = cx.global_mut::<Host>();
                host.ready_at = Some(Instant::now());
                let page = host.page.clone();
                if let Ok(webview) = page.update(cx, |page, _| {
                    page.open_session(port, block_port, secret);
                    page.webview.clone()
                }) {
                    capture::after_load(webview, cx);
                }
            }
            ToHost::Rpc { id, call } => {
                let reply = answer(call, cx);
                cx.spawn(async move |cx: &mut AsyncApp| {
                    let (result, error) = match reply.await {
                        Ok(result) => (Some(result), None),
                        Err(error) => (None, Some(error)),
                    };
                    cx.update(|cx| Self::send(&ToServer::RpcResult { id, result, error }, cx));
                })
                .detach();
            }
        }
    }

    /// The server closed its stdout, which it does only by exiting.
    fn exited(cx: &mut App) {
        let host = cx.global_mut::<Host>();
        let status = host.server.take().and_then(Server::exit_status);
        if host.quitting {
            return;
        }
        let stable = host.ready_at.is_some_and(|at| at.elapsed() >= STABLE_RUN);
        log::warn!("local server exited: {status:?}");
        if stable {
            Self::launch(cx);
        } else {
            let detail = status.map_or("It did not start.".to_owned(), |status| {
                format!("It exited with {status}. The log has the details.")
            });
            Self::stopped(&detail, cx);
        }
    }

    /// Tell the person the server is down and let them retry or quit.
    fn stopped(detail: &str, cx: &mut App) {
        let window = cx.global::<Host>().window;
        let detail = detail.to_owned();
        let _ = window.update(cx, |_, window, cx| {
            let answer = window.prompt(
                PromptLevel::Critical,
                "Theorem's local server stopped.",
                Some(&detail),
                &["Try Again", "Quit"],
                cx,
            );
            cx.spawn(async move |cx: &mut AsyncApp| {
                let retry = matches!(answer.await, Ok(0));
                cx.update(|cx| if retry { Self::launch(cx) } else { cx.quit() });
            })
            .detach();
        });
    }

    fn send(message: &ToServer, cx: &mut App) {
        if let Some(server) = cx.global_mut::<Host>().server.as_mut()
            && let Err(error) = server.send(message)
        {
            log::error!("writing to the local server: {error:#}");
        }
    }

    /// Tell the page something through the server's event stream.
    pub fn event(event: HostEvent, cx: &mut App) {
        Self::send(&ToServer::Event { event }, cx);
    }

    /// Add a folder the person picked to the grants, save them, and tell the server.
    fn grant(path: &Path, cx: &mut App) -> Result<FolderGrant, RpcError> {
        let path = path.canonicalize().map_err(failed)?;
        let grant = FolderGrant {
            name: path
                .file_name()
                .map_or_else(|| path.display().to_string(), |name| name.to_string_lossy().into()),
            path: path.to_string_lossy().into(),
        };
        let host = cx.global_mut::<Host>();
        if !host.grants.iter().any(|existing| existing.path == grant.path) {
            host.grants.push(grant.clone());
            let file = grants_file(&host.config);
            if let Err(error) = serde_json::to_vec_pretty(&host.grants)
                .map_err(anyhow::Error::from)
                .and_then(|bytes| Ok(fs::write(&file, bytes)?))
            {
                log::error!("saving grants to {}: {error:#}", file.display());
            }
            let grants = host.grants.clone();
            Self::send(&ToServer::Grants { grants }, cx);
        }
        Ok(grant)
    }

    fn granted(path: &str, cx: &App) -> Result<PathBuf, RpcError> {
        check_grant(path, &cx.global::<Host>().grants)
    }

    fn openable(path: &str, cx: &App) -> Result<PathBuf, RpcError> {
        check_openable(path, &cx.global::<Host>().grants)
    }
}

/// The canonical path, if it lies inside a granted folder. A path outside
/// every grant gets the same answer whether or not it exists, so the page
/// cannot use the errors to look around the disk.
fn check_grant(path: &str, grants: &[FolderGrant]) -> Result<PathBuf, RpcError> {
    let raw = Path::new(path);
    if !raw.is_absolute() || raw.components().any(|part| part == Component::ParentDir) {
        return Err(RpcError::new(
            RpcError::INVALID_PARAMS,
            format!("{path} is not an absolute path without `..`"),
        ));
    }
    match raw.canonicalize() {
        Ok(canonical) if within(&canonical, grants) => Ok(canonical),
        Err(error) if within(raw, grants) => Err(RpcError::new(
            RpcError::INVALID_PARAMS,
            format!("{path}: {error}"),
        )),
        _ => Err(RpcError::new(
            RpcError::NOT_GRANTED,
            format!("{path} is outside every granted folder"),
        )),
    }
}

/// Extensions macOS runs, installs or follows when it opens them, rather than
/// showing them in an app.
const LAUNCHED: &[&str] = &[
    "app",
    "command",
    "tool",
    "terminal",
    "jar",
    "pkg",
    "mpkg",
    "mobileconfig",
    "webloc",
    "inetloc",
    "fileloc",
];

/// A granted path the system may open with its default app. The page can
/// write into granted folders, so this refuses what the system would run
/// rather than open: folders (app bundles are folders), files marked
/// executable, and the types in [`LAUNCHED`].
fn check_openable(path: &str, grants: &[FolderGrant]) -> Result<PathBuf, RpcError> {
    let path = check_grant(path, grants)?;
    let metadata = fs::metadata(&path).map_err(failed)?;
    let launched = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| LAUNCHED.contains(&extension.to_ascii_lowercase().as_str()));
    if metadata.is_dir() || executable(&metadata) || launched {
        return Err(RpcError::new(
            RpcError::INVALID_PARAMS,
            format!("{} would run rather than open", path.display()),
        ));
    }
    Ok(path)
}

#[cfg(unix)]
fn executable(metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt as _;
    metadata.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
fn executable(_: &fs::Metadata) -> bool {
    false
}

fn grants_file(config: &ServerConfig) -> PathBuf {
    config.data_dir.join("grants.json")
}

fn load_grants(file: &Path) -> Vec<FolderGrant> {
    fs::read(file)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

/// Whether a canonical path lies in one of the grants. `Path::starts_with`
/// compares whole components, so `/notes-old` is not inside `/notes`.
fn within(canonical: &Path, grants: &[FolderGrant]) -> bool {
    grants
        .iter()
        .any(|grant| canonical.starts_with(Path::new(&grant.path)))
}

fn failed(error: impl std::fmt::Display) -> RpcError {
    RpcError::new(RpcError::FAILED, error.to_string())
}

/// Answer one bridge call. The reply goes back as a `rpc-result`.
fn answer(call: HostCall, cx: &mut App) -> Task<Result<Value, RpcError>> {
    let done = |result: Result<(), RpcError>| Task::ready(result.map(|()| Value::Null));
    match call {
        HostCall::PickFolder {} => pick_folder(cx),
        HostCall::OpenNativeEditor { path } => done(
            Host::granted(&path, cx).and_then(|path| editor::open(path, cx).map_err(failed)),
        ),
        HostCall::RevealInFinder { path } => {
            done(Host::granted(&path, cx).map(|path| cx.reveal_path(&path)))
        }
        HostCall::OpenWithDefault { path } => {
            done(Host::openable(&path, cx).map(|path| cx.open_with_system(&path)))
        }
        HostCall::OpenExternal { url } => done(match Url::parse(&url) {
            Ok(url) if matches!(url.scheme(), "http" | "https") => {
                cx.open_url(url.as_str());
                Ok(())
            }
            _ => Err(RpcError::new(
                RpcError::INVALID_PARAMS,
                "only http and https URLs open externally",
            )),
        }),
        HostCall::SetDocumentEdited { edited } => {
            let window = cx.global::<Host>().window;
            done(
                window
                    .update(cx, |_, window, _| window.set_window_edited(edited))
                    .map_err(failed),
            )
        }
        HostCall::Notify { title, body } => cx.background_executor().spawn(async move {
            // An unbundled build borrows another app's identity; the packaged
            // app is found by name and posts as itself.
            #[cfg(target_os = "macos")]
            {
                static IDENTITY: std::sync::Once = std::sync::Once::new();
                IDENTITY.call_once(|| {
                    let bundle = notify_rust::get_bundle_identifier_or_default("Theorem");
                    let _ = notify_rust::set_application(&bundle);
                });
            }
            notify_rust::Notification::new()
                .summary(&title)
                .body(body.as_deref().unwrap_or_default())
                .show()
                .map(|_| Value::Null)
                .map_err(failed)
        }),
    }
}

fn pick_folder(cx: &mut App) -> Task<Result<Value, RpcError>> {
    let paths = cx.prompt_for_paths(PathPromptOptions {
        files: false,
        directories: true,
        multiple: false,
        prompt: Some("Open".into()),
    });
    cx.spawn(async move |cx: &mut AsyncApp| {
        let picked = match paths.await {
            Ok(Ok(paths)) => paths.and_then(|paths| paths.into_iter().next()),
            Ok(Err(error)) => return Err(failed(error)),
            // The panel went away without an answer, as when the app quits.
            Err(_) => None,
        };
        let Some(path) = picked else {
            return Ok(Value::Null);
        };
        let grant = cx.update(|cx| Host::grant(&path, cx))?;
        serde_json::to_value(grant).map_err(failed)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grant(path: &str) -> FolderGrant {
        FolderGrant {
            path: path.into(),
            name: "notes".into(),
        }
    }

    #[test]
    fn paths_inside_a_grant_are_allowed() {
        let grants = [grant("/Users/a/notes")];
        assert!(within(Path::new("/Users/a/notes"), &grants));
        assert!(within(Path::new("/Users/a/notes/day/1.md"), &grants));
    }

    #[test]
    fn neighbours_of_a_grant_are_not() {
        let grants = [grant("/Users/a/notes")];
        assert!(!within(Path::new("/Users/a/notes-old/1.md"), &grants));
        assert!(!within(Path::new("/Users/a"), &grants));
        assert!(!within(Path::new("/etc/passwd"), &[]));
    }

    #[test]
    fn errors_do_not_reveal_files_outside_the_grants() {
        let dir = std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .join(format!("theorem-grant-{}", std::process::id()));
        fs::create_dir_all(dir.join("notes")).unwrap();
        fs::write(dir.join("notes/a.md"), "a").unwrap();
        fs::write(dir.join("secret.md"), "s").unwrap();
        let grants = [grant(dir.join("notes").to_str().unwrap())];
        let code = |path: &Path| check_grant(path.to_str().unwrap(), &grants).map_err(|e| e.code);

        assert_eq!(code(&dir.join("notes/a.md")), Ok(dir.join("notes/a.md")));
        assert_eq!(code(&dir.join("notes/missing.md")), Err(RpcError::INVALID_PARAMS));
        // Outside the grant, an existing file and a missing one look the same.
        assert_eq!(code(&dir.join("secret.md")), Err(RpcError::NOT_GRANTED));
        assert_eq!(code(&dir.join("missing.md")), Err(RpcError::NOT_GRANTED));
        // `..` and relative paths are refused before touching the disk.
        assert_eq!(code(&dir.join("notes/../secret.md")), Err(RpcError::INVALID_PARAMS));
        assert_eq!(code(Path::new("notes/a.md")), Err(RpcError::INVALID_PARAMS));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn only_granted_documents_open_with_their_app() {
        use std::os::unix::fs::PermissionsExt as _;
        let dir = std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .join(format!("theorem-open-{}", std::process::id()));
        let notes = dir.join("notes");
        fs::create_dir_all(notes.join("Tool.app")).unwrap();
        for name in ["paper.pdf", "data.bin", "run.command", "site.WEBLOC", "script.sh"] {
            fs::write(notes.join(name), "x").unwrap();
        }
        fs::set_permissions(notes.join("script.sh"), fs::Permissions::from_mode(0o755)).unwrap();
        fs::write(dir.join("secret.pdf"), "s").unwrap();
        let grants = [grant(notes.to_str().unwrap())];
        let code =
            |path: &Path| check_openable(path.to_str().unwrap(), &grants).map_err(|e| e.code);

        assert_eq!(code(&notes.join("paper.pdf")), Ok(notes.join("paper.pdf")));
        assert_eq!(code(&notes.join("data.bin")), Ok(notes.join("data.bin")));
        // The grant check comes first, with its answers.
        assert_eq!(code(&dir.join("secret.pdf")), Err(RpcError::NOT_GRANTED));
        assert_eq!(code(&dir.join("missing.pdf")), Err(RpcError::NOT_GRANTED));
        assert_eq!(code(&notes.join("../secret.pdf")), Err(RpcError::INVALID_PARAMS));
        assert_eq!(code(&notes.join("missing.pdf")), Err(RpcError::INVALID_PARAMS));
        // What the system would run is refused, whatever the case of its name.
        for name in ["Tool.app", "run.command", "site.WEBLOC", "script.sh"] {
            assert_eq!(code(&notes.join(name)), Err(RpcError::INVALID_PARAMS), "{name}");
        }
        assert_eq!(code(&notes), Err(RpcError::INVALID_PARAMS));
        fs::remove_dir_all(dir).unwrap();
    }
}
