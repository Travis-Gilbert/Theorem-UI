# Theorem UI IDE

The IDE half of Theorem UI, kept apart from the site at the repo root: its own `package.json`,
`bun.lock` and patches, so run everything below from `ide/`.

A browser-only [Eclipse Theia](https://theia-ide.org) application (Theia 1.76.0) with a Zed look.
It has no Theia backend: files, shared documents, terminals, language features, problems and
source control come from the Theorem workspace
host through `@theoremharness/sdk`, and the Theorem UI at the repo root serves the build at
`/theia/` and shows it in its IDE panel. The layout follows
[eclipse-theia/theia-ide](https://github.com/eclipse-theia/theia-ide): published `@theia/*` packages,
an application in `applications/browser`, and our own extensions in `theia-extensions/`.

## Requirements

Bun 1.4.3 or later, the version this is tested on.

## Building

```sh
bun install
bun run build
bun run download:plugins
```

`bun run build` writes `applications/browser/lib/frontend`. Run the Theorem UI from the repo
root (`bun run dev`) and open its IDE mode, or `/theia/?workspace=<id>&name=<name>` on its origin.

## Theorem workspace (`theia-extensions/theorem-workspace`)

Rebinds the seams Theia's own browser-only modules use:

- `FileSystemProvider`: the `file` scheme is the Theorem workspace, rooted at `file:///<name>`,
  with change events from the live workspace stream. Writes to existing files go through the
  shared document, so the authority stays the only writer.
- `MonacoEditorModelFactory`: every workspace file opens on an SDK `DocumentSession`, with its
  pending edits, conflicts, save and per-client undo.
- `TerminalWidget` and `TerminalFrontendContribution`: terminals are SDK `TerminalChannel`s.
  Closing one detaches; the shell stays on the host.
- Monaco language providers for workspace files call SDK `WorkspaceLanguage` at the revision the
  editor has flushed. Format, rename and code actions come back as plans the authority applies,
  so their edits arrive as document revisions like anyone else's.
- The host's findings for open documents go to `ProblemManager` (owner `theorem`), so editors and
  the Problems view show them. A snapshot is kept only for the text it was computed against.
- A Source Control provider over SDK `WorkspaceScm`: staged, unstaged and conflicted groups, stage,
  unstage, discard with Undo, commit, branch create and switch, fetch and push. Revision text is
  served under the `theorem-scm` scheme, which also gives editors Theia's dirty-diff gutter.
- Theia's own settings and storage stay in the browser under a `theia-user` scheme.
- `TheoremIdeBridge` links the frame to the Theorem UI with Penpal (contract in
  `src/common/ide-bridge.ts`): reveal, theme and commands one way, selection, Add Selection to
  Chat and manual navigation (which pauses Follow the Agent) the other.

## Patches

`bun install` applies these from `patches/` (see `patchedDependencies` in `package.json`). The
Bun-specific ones were for the Theia backend this application no longer runs; they stay until that
tooling is removed.

| Package | Problem under Bun | Fix |
| --- | --- | --- |
| `@theia/core` | Bun never reads from a `net.Socket` wrapped around an inherited fd, so the IPC channel to child processes on fd 4 stays silent. | `ipc-channel` uses fs streams on fd 4. |
| `node-pty` | `UnixTerminal` reads the PTY master through `tty.ReadStream` on a non-blocking fd, which Bun does not service, so terminals show no output. | `BunTerminal` implements node-pty's `IPty` on `Bun.spawn({ terminal })`; `index.js` selects it under Bun. |
| `@theia/plugin-ext` | Bun's `require` never calls `Module._load`, so the plugin host's overrides that inject the `vscode` API, node-pty and the proxy-aware `http`/`https`/`tls` never apply. Bun's `spawn` also returns after short-lived children have exited, so extensions that write to child stdin without an error listener (vscode.git) crash into the uncaught exception handler with EPIPE. | `bun-module-load-shim` replays `_load` overrides from `Module._resolveFilename`; `bun-child-stdin-shim` ignores EPIPE on child stdin, as execa does. Both load first in the plugin host, only under Bun. |
| `@theia/plugin-ext-vscode` | Node's ESM loader hook, which rewrites `import 'vscode'` in ESM extensions, does not exist in Bun. | A `Bun.plugin` rewrites those imports to a virtual module per extension that exports its API. |
| `@theia/plugin-utils`, `@theia/plugin-ext` | Not Bun-specific: the scanner drops a view's `"visibility"`, so views that extensions contribute as hidden (npm's NPM Scripts) show up at once. | The scanner keeps `visibility`, and the view registry adds `hidden` views hidden (until the user shows them) and `collapsed` views collapsed. |
| `@theia/navigator` | Not Bun-specific: context menus pass their anchor as the command argument, which the explorer's commands do not recognise as the navigator, so Collapse All never shows in the tree's context menu. | The explorer's commands fall back to the navigator when the argument is not a widget. |
| `@theia/terminal` | Not Bun-specific: with the bottom panel collapsed, Toggle Terminal expands it on its last tab rather than the terminal. | Activates the terminal through the shell. |
| `drivelist` | Not Bun-specific: the native build breaks when the checkout path contains a space. | Uses `node-addon-api`'s unquoted `include_dir`. |

## Zed look (`theia-extensions/zed-look`)

- Zed's bundled One, Ayu and Gruvbox theme families, converted to VS Code themes and registered
  with Monaco (`zed-theme-converter.ts` inverts Zed's `theme_importer`). The default is
  One Dark (Zed).
- Zed's title bar in place of the menu bar: an application menu button that holds the main menu, the
  project name, which opens recent workspaces, and the current branch, which opens git's branch picker
  (and so leaves the status bar).
- No activity bar. Each dock's views are toggled from icon buttons at the ends of the status bar,
  as in Zed, with a terminal button on the right.
- The explorer is the file tree alone, like Zed's project panel: no title row, and Open Editors and
  Timeline start hidden. The title row's actions are in the tree's context menu, whose Views submenu
  brings the hidden views back. Other panels keep their title rows, as Zed's git and debug panels do.
- Zed's fonts: IBM Plex Sans for the UI and Lilex for code and the terminal, along with Zed's
  type scale, title bar, tab and status bar heights, scrollbars, flat tabs, and rounded popovers.

`bun test` in `theia-extensions/zed-look` checks the theme conversion.
