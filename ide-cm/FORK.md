# FORK.md: the OpenIDEA frontend in `ide-cm`

| | |
| --- | --- |
| Upstream | https://github.com/l0ng-ai/openidea |
| Revision | `9847fd2c01db19bf5f7b7c09b17eb3afc9ef5077` |
| Licence | Apache-2.0 (`vendor/openidea/LICENSE`) |
| Notices | `vendor/openidea/NOTICE` and `vendor/openidea/THIRD_PARTY_LICENSES.md`, copied unchanged. They cover the JetBrains IntelliJ Platform icons and the Simplified Chinese terms bundled in the frontend. OpenIDEA is not affiliated with JetBrains; neither is this fork. |
| Taken | The React/CodeMirror frontend only: `src/`, `public/`, `languages/`, `index.html` (kept for reference, not used), and `src-tauri/icons/128x128.png` (three components import it). |
| Not taken | The Rust backend, the Tauri shell, the plugin host, `e2e/`, `perf/`, `docs/`, templates and every root manifest, including `tsconfig.json`: Bun resolves a file's imports against the nearest `tsconfig.json`, so a vendored one would hide this package's `paths` (the Tauri shims, `@host/`) from every test that loads a vendored file. `../tsconfig.json` is the only one. |

`sh scripts/verify-fork.sh` checks everything below that concerns `vendor/openidea`: that the pin is
the upstream checkout's HEAD, that no vendored file is missing from upstream, that the files that
differ are exactly the four named here, that `patches/theorem-fork.patch` is exactly that
difference, and that the only upstream files left out of `src/` are tests.

## Divergences in `vendor/openidea` (`patches/theorem-fork.patch`)

Four files. Each is a seam, not a rewrite; each is the smallest change that lets the page supply
what the desktop build gets from Rust.

| | File | Change | Why |
| --- | --- | --- | --- |
| P1 | `src/editor/core/backend.ts`, `src/editor/core/model/document.ts` | `DocBackend` gains an optional `createSync(info, host)`. `DocModel` uses it when present and builds OpenIDEA's own `DocSync` when absent. `DocSyncHandle` and `DocSyncHost` name the surface `DocModel` already used (`localText`, `local`, `whenIdle`, `dispose`). | The desktop `DocSync` is a second operation-transform client over its own `doc_edit` protocol. In the browser the SDK `DocumentSession` is the client. |
| P2 | `src/platform/ipc.ts` | `isTauri()` is also true when a browser host is installed (`hostAvailable()` from `@host/host`). | Dozens of call sites guard on `isTauri()` to decide whether a backend exists. A Theorem workspace host is a backend. |
| P3 | `src/editor/core/backend.ts` | `setDocBackend(backend)` swaps the module's `docBackend`. | The workspace-backed backend is built after the connection is open, not at import time. |
| P4 | `src/platform/tauriCore.ts` | Its two imports of `../../node_modules/@tauri-apps/api/core.js` point at `@host/tauri-core`. | The module wraps the real Tauri `invoke` with remote-development routing. There is no Tauri package here; the wrapper stays and the browser host sits below it. |

Left out of `vendor/openidea/src`: every `*.test.ts(x)`, every `__tests__/` directory,
`src/test/` and `src/platform/__fixtures__/`. Nothing else under `src/` is missing.

## What `ide-cm` adds (not upstream code)

| Path | What it is |
| --- | --- |
| `src/entry.tsx`, `index.html` | The page's entry. It replaces `main.tsx`, which boots a Tauri window. The only difference in `index.html` is the title and the entry script. The splash is upstream's. |
| `src/host/host.ts`, `browser-host.ts` | The browser host interface that replaces the Tauri runtime: commands, events, streaming channels, file selection, window behaviours, external links, and a typed `unavailable` failure for every command nobody answers. Refusals are counted (`host.refused`). |
| `src/host/tauri-*.ts`, `plugin-*.ts` | Shims for `@tauri-apps/api/{core,event,path,window,webview,webviewWindow}` and `@tauri-apps/plugin-{dialog,opener}`, mapped by the Vite and TypeScript aliases. No Tauri global exists on the page. |
| `src/host/connection.ts` | One `TheoremClient`, `WorkspaceLive` (resumable stream, cursor kept in `localStorage`), shared `DocumentSession`s by path, and `WorkspaceLanguage` / `WorkspaceScm` handles. It reopens the workspace, seats the documents it holds again (`documents.open`) and repeats the request when a restarted host answers `workspace_not_open`, because the SDK ends the live stream for good on any 404; and it bounds the repeat of an edit the authority refuses as behind the session (`current_revision` below `base_revision`), which the SDK would otherwise resend without end. It also isolates resync listeners (`isolateResyncListeners`): the SDK awaits each one inside the stream's read loop and takes a rejection as the stream failing, so one consumer that cannot re-read (a terminal whose shell died with the host) would hold the stream in a reconnect loop at a cursor the host no longer knows. It names the two roots a path can be in (`locate`): the checkout at `/<name>` and the caller's state store at `/<name>.ide-state` (the host's `root: "state"`), and sends the operations SDK 0.5.0 has no method for (`files.copy`, `files.setMode`) through the same transport (`operate`). |
| `src/host/session-sync.ts`, `session-extensions.ts` | The binding between a CodeMirror document and a `DocumentSession`. See `docs/plans/platinum-master/lanes/I02.md` in the Theorem repo for the semantics. |
| `src/host/cm-commands.ts` | `@codemirror/commands`, re-exported, with `undo`/`redo` (and the history keymap) routed to the session's per-client undo when the document has a session. |
| `src/host/commands/*` | The command table: app, project, window, settings, document, file-system, Find in Files and terminal commands answered over the SDK. A listing is the host's (one directory, directories first, natural order, with sizes and `ignored`/`excluded`/`hidden` flags); `fs_probe` is the host's look at a file's head and reads none of it; a range read asks for the range (capped at 1 MiB by the host); copy, binary create and modes are the host's operations. IDE state that does not belong in the checkout (scratches, the application data and config directories) lives in the state store, where a scratch opens as an OpenIDEA document without a session. Find in Files feeds OpenIDEA's own search view from `search.query`, call by call, with the host's scalar ranges turned into UTF-16. |
| `src/host/ui/*` | The conflict bar, the session status item and the workspace path picker. |
| `src/host/stubs/*` | Empty components for `workbench/WindowControls` and `workbench/WindowResizeHandles`, swapped in by `vite.config.ts` because a tab has the browser's window chrome. |
| `dev/*` | A development STAND-IN for the Theorem UI product server (bootstrap, CSRF, and forwarding with the host's bearer and tenant). Not part of the build output. |
| `vite.config.ts`, `tsconfig.json`, `package.json`, `bunfig.toml` | Tooling. Bun, Vite 8, TypeScript 6. The SDK is the vendored tarball Theorem UI already uses. |

## Behaviour that differs from the desktop app

The page is a client of one Theorem workspace. Features that need a local machine are not
imitated. Each answers with an `unavailable` failure that names the reason, and the list is kept in
`docs/plans/platinum-master/lanes/I02.md`. In summary: new windows, the Settings window, remote
development, LightEdit, project trust changes, settings export and import, encoding and
line-ending changes, choosing a terminal's shell, directory or environment, moving or copying
between the checkout and the state store, the parts of Find in Files the host cannot search by
(comment or string context, change-set and pattern scopes, preserve case) and applying
a replace, and every command in groups the page does not yet connect (version control,
language-server, debugger). Theia keeps those workflows until `ide-cm` shows parity.
