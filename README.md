# Theorem UI

A browser-and-backend [Eclipse Theia](https://theia-ide.org) application (Theia 1.76.0) that runs on
[Bun](https://bun.sh) instead of Node, with a Zed look. The layout follows
[eclipse-theia/theia-ide](https://github.com/eclipse-theia/theia-ide): published `@theia/*` packages,
an application in `applications/browser`, and our own extensions in `theia-extensions/`.
Fixes to upstream packages are kept as `bun patch` files rather than a fork.

## Requirements

Bun 1.4.3 or later, the version this is tested on.

## Running

```sh
bun install
bun run build
bun run download:plugins
bun run start
```

Then open http://127.0.0.1:3000.

## Patches

`bun install` applies these from `patches/` (see `patchedDependencies` in `package.json`).

| Package | Problem under Bun | Fix |
| --- | --- | --- |
| `@theia/core` | Bun never reads from a `net.Socket` wrapped around an inherited fd, so the IPC channel to child processes on fd 4 stays silent. | `ipc-channel` uses fs streams on fd 4. |
| `node-pty` | `UnixTerminal` reads the PTY master through `tty.ReadStream` on a non-blocking fd, which Bun does not service, so terminals show no output. | `BunTerminal` implements node-pty's `IPty` on `Bun.spawn({ terminal })`; `index.js` selects it under Bun. |
| `@theia/plugin-ext` | Bun's `require` never calls `Module._load`, so the plugin host's overrides that inject the `vscode` API, node-pty and the proxy-aware `http`/`https`/`tls` never apply. Bun's `spawn` also returns after short-lived children have exited, so extensions that write to child stdin without an error listener (vscode.git) crash into the uncaught exception handler with EPIPE. | `bun-module-load-shim` replays `_load` overrides from `Module._resolveFilename`; `bun-child-stdin-shim` ignores EPIPE on child stdin, as execa does. Both load first in the plugin host, only under Bun. |
| `@theia/plugin-ext-vscode` | Node's ESM loader hook, which rewrites `import 'vscode'` in ESM extensions, does not exist in Bun. | A `Bun.plugin` rewrites those imports to a virtual module per extension that exports its API. |
| `@theia/terminal` | Not Bun-specific: with the bottom panel collapsed, Toggle Terminal expands it on its last tab rather than the terminal. | Activates the terminal through the shell. |
| `drivelist` | Not Bun-specific: the native build breaks when the checkout path contains a space. | Uses `node-addon-api`'s unquoted `include_dir`. |

## Zed look (`theia-extensions/zed-look`)

- Zed's bundled One, Ayu and Gruvbox theme families, converted to VS Code themes and registered
  with Monaco (`zed-theme-converter.ts` inverts Zed's `theme_importer`). The default is
  One Dark (Zed).
- No activity bar. Each dock's views are toggled from icon buttons at the ends of the status bar,
  as in Zed, with a terminal button on the right.
- Zed's fonts: IBM Plex Sans for the UI and Lilex for code and the terminal, along with Zed's
  type scale, title bar and tab heights, flat tabs, and rounded popovers.

`bun test` in `theia-extensions/zed-look` checks the theme conversion.
