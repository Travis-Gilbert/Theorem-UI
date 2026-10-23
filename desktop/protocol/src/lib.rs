//! Messages between the desktop host, the local server and the page.
//!
//! Two channels use them (plan D4, D5):
//!
//! - The control channel: newline-delimited JSON on the server's stdin
//!   ([`ToServer`]) and stdout ([`ToHost`]). The server's stdout also carries
//!   its ordinary logs, so a line is a control message only when it parses as
//!   a [`ToHost`]; anything else is a log line.
//! - The bridge: the page posts JSON-RPC 2.0 to `/desktop/host/rpc`, and the
//!   server relays the call to the host as [`ToHost::Rpc`]. Host events reach
//!   the page through the server-sent event stream at `/desktop/host/events`.
//!
//! `cargo test -p theorem-desktop-protocol` regenerates the TypeScript bindings
//! in `src/lib/desktop/bindings/`, so the two sides cannot drift.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

/// A call the page makes on the host. Serialized the way JSON-RPC 2.0 spells
/// a request's `method` and `params`.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
#[serde(
    tag = "method",
    content = "params",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum HostCall {
    /// Show the system folder picker. Answers a [`FolderGrant`], or `null`
    /// when the person cancels. A picked folder joins the host's grants.
    PickFolder {},
    /// Open a file in a native editor window. The path must lie inside a
    /// granted folder.
    OpenNativeEditor { path: String },
    /// Show a file or folder in Finder. The path must lie inside a granted
    /// folder.
    RevealInFinder { path: String },
    /// Open a file with the app the system uses for its type. The path must
    /// be a file inside a granted folder, and one the system would open with
    /// an app rather than run.
    OpenWithDefault { path: String },
    /// Open an `http` or `https` URL in the system browser.
    OpenExternal { url: String },
    /// Mark the main window as having unsaved changes.
    SetDocumentEdited { edited: bool },
    /// Show a system notification.
    Notify { title: String, body: Option<String> },
}

/// A folder the person opened through the system picker. Only granted folders
/// can be served by the workspace routes or touched through the bridge.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FolderGrant {
    /// Absolute, canonical path.
    pub path: String,
    /// The folder's display name.
    pub name: String,
}

/// Something the host tells the page, through `/desktop/host/events`.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum HostEvent {
    /// The native editor wrote a file.
    FileSaved { path: String },
    /// The set of granted folders changed.
    GrantsChanged { grants: Vec<FolderGrant> },
}

/// The error half of a bridge reply, in JSON-RPC 2.0's shape.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
#[ts(export)]
pub struct RpcError {
    #[ts(type = "number")]
    pub code: i64,
    pub message: String,
}

impl RpcError {
    /// JSON-RPC 2.0's code for invalid parameters.
    pub const INVALID_PARAMS: i64 = -32602;
    /// Application error: the path lies outside every granted folder.
    pub const NOT_GRANTED: i64 = -32001;
    /// Application error: the host could not complete the call.
    pub const FAILED: i64 = -32002;

    pub fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

/// Host to server, one JSON object per line on the server's stdin.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
#[serde(
    tag = "ctl",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum ToServer {
    /// The first message. `secret` is the one-time launch secret the web view
    /// exchanges at `/desktop/session` for the session cookie.
    Hello {
        secret: String,
        grants: Vec<FolderGrant>,
    },
    /// The granted folders changed.
    Grants { grants: Vec<FolderGrant> },
    /// The reply to a [`ToHost::Rpc`]: exactly one of `result` and `error`.
    RpcResult {
        #[ts(type = "number")]
        id: u64,
        result: Option<Value>,
        error: Option<RpcError>,
    },
    /// An event for the page.
    Event { event: HostEvent },
}

/// Server to host, one JSON object per line on the server's stdout.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize, TS)]
#[serde(
    tag = "ctl",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum ToHost {
    /// The server is listening: the app on `port`, live blocks on `block_port`.
    Ready { port: u16, block_port: u16 },
    /// A bridge call from the page. Answer with [`ToServer::RpcResult`].
    Rpc {
        #[ts(type = "number")]
        id: u64,
        call: HostCall,
    },
}

impl ToHost {
    /// Parse one line of the server's stdout. `None` means a log line.
    pub fn parse_line(line: &str) -> Option<Self> {
        let line = line.trim();
        if !line.starts_with('{') {
            return None;
        }
        serde_json::from_str(line).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn bridge_calls_use_json_rpc_method_and_params() {
        let call: HostCall = serde_json::from_value(
            json!({ "method": "openNativeEditor", "params": { "path": "/a.md" } }),
        )
        .unwrap();
        assert_eq!(
            call,
            HostCall::OpenNativeEditor {
                path: "/a.md".into()
            }
        );
        let pick: HostCall =
            serde_json::from_value(json!({ "method": "pickFolder", "params": {} })).unwrap();
        assert_eq!(pick, HostCall::PickFolder {});
        let open: HostCall = serde_json::from_value(
            json!({ "method": "openWithDefault", "params": { "path": "/a.pdf" } }),
        )
        .unwrap();
        assert_eq!(
            open,
            HostCall::OpenWithDefault {
                path: "/a.pdf".into()
            }
        );
    }

    #[test]
    fn control_lines_are_told_apart_from_logs() {
        assert_eq!(
            ToHost::parse_line("Listening on http://127.0.0.1:4000"),
            None
        );
        assert_eq!(ToHost::parse_line(r#"{"level":"info"}"#), None);
        assert_eq!(
            ToHost::parse_line(r#"{"ctl":"ready","port":4000,"blockPort":4001}"#),
            Some(ToHost::Ready {
                port: 4000,
                block_port: 4001
            })
        );
    }

    #[test]
    fn hello_carries_the_secret_and_the_grants() {
        let hello = ToServer::Hello { secret: "s".into(), grants: vec![] };
        assert_eq!(
            serde_json::to_value(&hello).unwrap(),
            json!({ "ctl": "hello", "secret": "s", "grants": [] })
        );
    }
}
