//! The local server as a child process (plan D4), on the contract in
//! `docs/desktop/local-server.md`: spawned with Bun, `hello` written at once,
//! newline-delimited JSON both ways on stdin and stdout.
//!
//! SOURCING: `std::process` and one reader thread; `which` finds Bun on PATH.
//! The message types are `theorem-desktop-protocol`, shared with the server.

use std::fs;
use std::io::{BufRead as _, BufReader, Write as _};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};

use anyhow::{Context as _, anyhow, bail};
use futures::channel::mpsc::{UnboundedReceiver, unbounded};
use serde::{Deserialize, Serialize};
use theorem_desktop_protocol::{ToHost, ToServer};

/// Where the server and its runtime are, resolved once at startup.
#[derive(Clone, Debug)]
pub struct ServerConfig {
    pub bun: PathBuf,
    pub app_dir: PathBuf,
    pub data_dir: PathBuf,
}

impl ServerConfig {
    /// `THEOREM_APP_DIR`, else the checkout this binary was built from.
    pub fn resolve(data_dir: PathBuf) -> anyhow::Result<Self> {
        let app_dir = std::env::var_os("THEOREM_APP_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join(".."));
        let app_dir = app_dir
            .canonicalize()
            .with_context(|| format!("app directory {}", app_dir.display()))?;
        Ok(Self {
            bun: find_bun()?,
            app_dir,
            data_dir,
        })
    }

    fn entry(&self) -> PathBuf {
        self.app_dir.join(".output/server/index.mjs")
    }
}

/// `THEOREM_BUN`, then a `bun` beside the executable (the packaged app), then
/// PATH, then Bun's own install location.
fn find_bun() -> anyhow::Result<PathBuf> {
    if let Some(bun) = std::env::var_os("THEOREM_BUN") {
        return Ok(PathBuf::from(bun));
    }
    let beside = std::env::current_exe()
        .ok()
        .and_then(|exe| Some(exe.parent()?.join("bun")));
    let installed = dirs::home_dir().map(|home| home.join(".bun/bin/bun"));
    beside
        .filter(|path| path.is_file())
        .or_else(|| which::which("bun").ok())
        .or(installed.filter(|path| path.is_file()))
        .ok_or_else(|| anyhow!("Bun was not found. Install it from bun.sh or set THEOREM_BUN."))
}

/// The app and live-block ports. Kept in the data directory so the page's
/// origin, and the storage that belongs to it, stay the same between launches.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ports {
    pub port: u16,
    pub block_port: u16,
}

impl Ports {
    /// The saved ports, or new ones when there are none or either is taken.
    pub fn load_or_pick(file: &Path) -> anyhow::Result<Self> {
        let saved = fs::read(file)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Ports>(&bytes).ok());
        if let Some(ports) = saved.filter(|ports| free(ports.port) && free(ports.block_port)) {
            return Ok(ports);
        }
        // Hold both listeners at once so the system cannot hand out one port twice.
        let app = TcpListener::bind(("127.0.0.1", 0))?;
        let blocks = TcpListener::bind(("127.0.0.1", 0))?;
        let ports = Ports {
            port: app.local_addr()?.port(),
            block_port: blocks.local_addr()?.port(),
        };
        fs::write(file, serde_json::to_vec(&ports)?)?;
        Ok(ports)
    }
}

fn free(port: u16) -> bool {
    port != 0 && TcpListener::bind(("127.0.0.1", port)).is_ok()
}

pub struct Server {
    child: Child,
    stdin: ChildStdin,
}

impl Server {
    /// Start the server and send `hello`. Control lines from its stdout
    /// arrive on the receiver, which ends when the server closes stdout.
    pub fn spawn(
        config: &ServerConfig,
        ports: Ports,
        hello: &ToServer,
    ) -> anyhow::Result<(Self, UnboundedReceiver<ToHost>)> {
        let entry = config.entry();
        if !entry.is_file() {
            bail!(
                "{} is missing. Run `bun run build` in {} first.",
                entry.display(),
                config.app_dir.display()
            );
        }
        let mut child = Command::new(&config.bun)
            .arg("run")
            .arg(&entry)
            .current_dir(&config.app_dir)
            .env("THEOREM_DESKTOP", "1")
            .env("NITRO_HOST", "127.0.0.1")
            .env("NITRO_PORT", ports.port.to_string())
            .env("THEOREM_BLOCK_PORT", ports.block_port.to_string())
            .env("THEOREM_DESKTOP_DATA_DIR", &config.data_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .with_context(|| format!("starting {}", config.bun.display()))?;
        let stdin = child.stdin.take().context("server stdin")?;
        let stdout = child.stdout.take().context("server stdout")?;

        let (sender, receiver) = unbounded();
        std::thread::Builder::new()
            .name("server-stdout".into())
            .spawn(move || {
                for line in BufReader::new(stdout).lines() {
                    let Ok(line) = line else { break };
                    match ToHost::parse_line(&line) {
                        Some(message) => {
                            if sender.unbounded_send(message).is_err() {
                                break;
                            }
                        }
                        None => log::info!(target: "server", "{line}"),
                    }
                }
            })?;

        let mut server = Self { child, stdin };
        server.send(hello)?;
        Ok((server, receiver))
    }

    pub fn send(&mut self, message: &ToServer) -> anyhow::Result<()> {
        let mut line = serde_json::to_vec(message)?;
        line.push(b'\n');
        self.stdin.write_all(&line)?;
        self.stdin.flush()?;
        Ok(())
    }

    /// Wait for the process once its stdout has closed.
    pub fn exit_status(mut self) -> Option<ExitStatus> {
        self.child.wait().ok()
    }
}

/// A one-time launch secret: 32 random bytes, hex.
pub fn new_secret() -> anyhow::Result<String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|error| anyhow!("random secret: {error}"))?;
    Ok(hex::encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ports_are_kept_between_launches() {
        let dir = std::env::temp_dir().join(format!("theorem-ports-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("ports.json");
        let first = Ports::load_or_pick(&file).unwrap();
        assert_ne!(first.port, first.block_port);
        assert_eq!(Ports::load_or_pick(&file).unwrap(), first);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_taken_port_is_replaced() {
        let dir = std::env::temp_dir().join(format!("theorem-taken-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("ports.json");
        let taken = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = taken.local_addr().unwrap().port();
        let saved = Ports {
            port,
            block_port: port.wrapping_add(1),
        };
        fs::write(&file, serde_json::to_vec(&saved).unwrap()).unwrap();
        assert_ne!(Ports::load_or_pick(&file).unwrap().port, port);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn secrets_are_long_and_fresh() {
        let secret = new_secret().unwrap();
        assert_eq!(secret.len(), 64);
        assert_ne!(secret, new_secret().unwrap());
    }
}
