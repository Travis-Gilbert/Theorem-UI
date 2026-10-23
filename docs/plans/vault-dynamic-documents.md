# Theorem UI desktop app, folder workspaces and dynamic documents

Theorem UI gets a desktop app. It has one interface, the React app in this
repo:
- in a browser, it is the website it is today;
- on the desktop, a new GPUI application shows the same app in Servo,
  served by Theorem UI's own server running on the machine.

GPUI supplies what a web page cannot do on its own:
- windows and menus;
- native dialogs;
- OS integration;
- native surfaces where they earn their place, such as a native editor
  window, GPU views or an agent-driven browser.

On top of that, the app opens any folder of ordinary files as a workspace, the
way people use Obsidian:
- notes can hold live tools;
- agent runs leave a readable journal;
- the same workspace syncs to the phone.

The principle, from the attached analysis: **TypeScript owns the interface.
Servo renders it on the desktop. GPUI supplies native capabilities and
specialized surfaces. Theorem owns the work.**

The checklist in `vault-dynamic-documents.checklist.json` tracks this plan
item by item. This is a plan, not a shipped milestone. The owner chose the
engine on 2026-10-22: Servo 0.7 renders the main window (D2).

## Scope of this app

- **A new application.** It extends no existing GPUI app. It does not build
  on `theorem-desktop`, the Theorem IDE workbench or any other Theorem GPUI
  binary, and it does not link Theorem's GPUI crates.
- **It lives in this repo.** Its Rust host is a new `desktop/` package. The
  untracked `ide/` directory belongs to separate Theia work.
- **Theorem's repo rules do not bind it.** SPEC-THEOREM-DESKTOP-SHELL-SERVO-RR-1.0
  governs Theorem's own desktop, not Theorem UI. This app uses Servo because
  its owner chose Servo for it, not because that spec requires it.
- **It uses Theorem's Servo 0.7 fork.** The fork is rebased onto upstream
  v0.7.0 and adds the IndexedDB, Web Locks and storage work the public
  embedding API cannot express. The app consumes it as a git dependency,
  pinned to the same revision as Theorem's own browser. It does not use
  Turvo's Servo 0.5.0 fork or Theorem's `libtheorem_ide_webview.dylib`.

## Sources and what they changed

- **Geoffrey Litt, "Dynamic Documents as Personal Software"**
  (https://youtu.be/MccJdr61xnc), and Eric Michaud's "Obsidian as a backend"
  (https://www.youtube.com/watch?v=4z2i6UsQG1k), which the first pasted
  analysis described.

  Michaud contributes:
  - plain Markdown on disk;
  - scripts that populate files;
  - agents that keep a log;
  - a custom front end.

  Litt changes several design choices:
  1. **Text first, canvas second.** Litt's team built a canvas-first planning
     prototype, and it failed because text notes were where planning
     happened. The Markdown file is the center here. The canvas is a view
     over files, not the home.
  2. **Live blocks inside an editable document beat whole-HTML documents.**
     Notion's HTML blocks let an agent put a live embed in a document people
     still edit and comment on. Live blocks in Markdown are the first-class
     form. Whole-page apps come second.
  3. **Blocks share state.** In Notion's custom blocks and in Riffle, several
     views share one store, so local versus shared is a policy switch.
  4. **A low floor and a high ceiling, as a ramp.** The steps are browse, then
     type, then author, then program (the HyperCard ramp). Formulas and views
     are a layer on top of live blocks, not a separate product.
  5. **Embark's pieces map to later layers:**
     - mentions of structured data;
     - formulas that repeat per day and chain;
     - table and calendar views that collect the mentions in an outline
       subtree;
     - properties that inherit down the subtree.
  6. **Bring the tool to the workbench.** A tool is a file in the workspace
     that a note embeds by reference.
  7. **Show data next to code.** Margin Notes shows last-run values beside the
     code that produced them.
  8. **Literate agent output.** Agent results and journal entries can use the
     same live blocks.
- **The attached analysis.** It came in two passes, and the later pass
  replaced the earlier one.
  - **The earlier pass** recommended native GPUI chrome (rail, sidebar, dock,
    composer) around embedded web panels.
  - **The later pass** recommended one canonical TypeScript interface that
    Servo renders on the desktop. This plan adopts the later pass:
    - its principle;
    - its first milestone, a conformance pass against a normal browser
      (Phase 0);
    - its two boundaries to keep: credentials stay in the server, and
      executable content stays out of the app's origin.

  Two corrections, checked in source:
  1. **Servo here is the owner's choice, not Theorem's rule.** The later pass
     assumed Theorem's desktop spec requires Servo. That spec does not bind
     Theorem UI. The owner chose Servo 0.7 for this app on its own merits
     (D2).
  2. **The app needs neither Theorem's Servo attach crate nor its engine
     library.** The analysis proposed generalizing
     `theorem-ide-webview-attach`. That crate depends on Theorem's GPUI fork,
     its `agpui-shell` and its `webview-surface` crate, so a new app cannot
     link it. Its engine library, `libtheorem_ide_webview.dylib`, exposes a C
     interface, but it is built inside Theorem's repository, on Theorem's
     schedule, from an unrecorded Servo version. Servo 0.7.0 is published on
     crates.io as a library with an embedding API, so the app depends on it
     directly.
- **Servo 0.7.0** (crates.io, published 2026-10-05, `rust-version` 1.88).
  - **The embedding API:**
    - `ServoBuilder` builds the engine. `Opts.config_dir` is handed to the
      network and storage threads, so site data can live in the app's data
      directory.
    - `WebViewBuilder::new(&servo, rendering_context)` takes `.url()`,
      `.delegate()`, `.user_content_manager()` and `.clipboard_delegate()`.
    - `WebView` has `notify_input_event`, `resize`,
      `set_hidpi_scale_factor`, `set_focused`, `paint`, `evaluate_javascript`
      and `take_screenshot`, and it exposes an AccessKit tree.
    - `WebViewDelegate` has:
      - `request_navigation` (the URL of each top-frame or iframe
        navigation);
      - `request_create_new` (for `window.open`);
      - `load_web_resource`, which can intercept any request and stream a
        response (`intercept`, `send_body_data`, `finish`). The request
        carries `is_for_main_frame` and its destination.
      - `notify_cursor_changed`, `notify_new_frame_ready` and
        `notify_input_event_handled`;
      - `show_embedder_control` and `hide_embedder_control`, for controls
        the page cannot draw itself: `<select>` menus, the color picker, the
        file picker, the input method, `alert`/`confirm`/`prompt` and the
        context menu.
    - `servo::protocol_handler` registers custom URL schemes.
  - **Rendering contexts:**
    - `WindowRenderingContext` draws into a native view, given its raw
      window handle;
    - `OffscreenRenderingContext` draws to a texture of a parent context;
    - `SoftwareRenderingContext` draws in software.

    All of them sit on surfman 0.14, which on macOS backs its surfaces with
    BGRA `IOSurface`s.
  - **What Servo leaves to the embedder:**
    - native input: mouse, wheel, keyboard and IME events arrive only when
      the embedder forwards them;
    - the cursor and the clipboard;
    - every embedder control listed above.
  - **Features.** The default set is `bundled`, `clipboard`, `js_jit` and
    `multiprocess`, and it does not include `webcrypto`.
    `src/lib/theorem/note-canonical.ts` calls `crypto.subtle`, so the app
    must enable `webcrypto`.
  - **SpiderMonkey.** `mozjs_sys`'s build script downloads a prebuilt
    archive by default. `MOZJS_FROM_SOURCE` builds it from source instead.
  - **Prior art.**
    - No crate joins Servo and GPUI.
    - `iced_servo` 0.1.0 embeds Servo in Iced. It renders with
      `SoftwareRenderingContext`, reads each frame back with
      `read_to_image` and uploads it as a texture, so every frame passes
      through the CPU.
    - `tauri-runtime-servo` 0.1.0 runs Servo under Tauri, where Tao owns the
      event loop.
    - servoshell, in the Servo repository, is the reference for translating
      platform input into Servo events.
  - **Upstream progress since Turvo's 0.5.0:** 0.6.0 (2026-09-29) enabled CSS
    Grid by default and reworked selection and `contenteditable`, and 0.7.0
    continued the selection work. How well this serves Crepe, React Flow and
    Dockview is measured in Phase 0, not assumed.
- **GPUI Kit 0.8.0** (`longbridge/gpui-kit`, tag `v0.8.0`, released
  2026-10-19).
  - **GPUI version.** GPUI Kit pins `gpui-pre` `=0.3.9`, whose platform layer
    is `gpui-pre-platform`, and on Apple systems `gpui-pre-apple`.
  - **What the host uses from it:**
    - **Native views.** `gpui::Window` implements `HasWindowHandle`, so the
      host can find its `NSView` and add a child view for Servo.
    - **Popup windows.** `gpui-pre` has parent-anchored popup windows for
      menus, dropdowns and context menus. These can float above a native
      child view.
    - **External frames.** `gpui::surface()` paints a `CVPixelBuffer` inside
      GPUI's own scene. However, `gpui-pre-apple`'s Metal renderer asserts
      that the buffer is `kCVPixelFormatType_420YpCbCr8BiPlanarFullRange`
      (`metal_renderer.rs:1219`), the format of screen capture. Servo's frames
      are BGRA, so drawing them this way needs a BGRA path in that renderer
      (D2).
    - The `input` code editor, `TextView::markdown`, the dock, `Dialog` and
      the other components.
    - GPUI Shell, with its default-deny capabilities and `HostModule`.
  - **Not used for the main window:** `gpui-webview` (Wry over WKWebView) and
    the `gpui-fast` backend, which existed to composite that native web view.
- **GPUIX** (`remorses/gpuix` 0.11) renders React through GPUI. It is not used
  for the app's interface, because that would rebuild the React app a second
  time. Its own notes also rule out nested scroll containers ("Never put a
  scroll container inside another scroll container"), and a chat transcript
  with scrollable artifacts needs them. It stays an option for native surfaces
  someone wants to write in React.
- **Seams in this repo the plan relies on:**
  - **`src/lib/theorem/client.ts`** builds `TheoremClient` with
    `baseUrl: window.location.origin` and no auth, and
    **`src/server/theorem-proxy.ts`** injects the bearer server-side. When
    the page is served by the local server, both work on the desktop
    unchanged.
  - **`src/components/artifacts/artifact-view.ts`** already separates "open
    this artifact" from Dockview through the `ArtifactDock` interface (`open`,
    `expand`, `close`).
  - **`src/components/shell/shell-state.ts`** persists the Dockview layout and
    shell preferences in `localStorage`. Storage is keyed by origin, and the
    origin includes the port, so the desktop server needs a stable port (D4)
    and Servo needs a persistent `config_dir` (D2).
  - **The production build** is TanStack Start on Nitro's `bun` preset, which
    writes `.output/server/index.mjs` and runs it with `bun run`.
- **Harness memory was unavailable during research.** `recall` failed because
  the store was unreachable. The survey was read from source, not from prior
  Harness decisions.

## Decisions

### D1. The desktop app: a GPUI host around Servo

**What the host is.**
- A Rust binary on GPUI Kit 0.8 (`gpui-pre` 0.3.9) that embeds Servo 0.7,
  from Theorem's fork.
- macOS comes first. GPUI and Servo both support Windows and Linux.

**The main window.**
- One full-window Servo web view shows Theorem UI.
- Nothing in the interface is rebuilt natively:
  - Dockview keeps the layout;
  - assistant-ui renders the chat;
  - React Flow draws canvases;
  - Crepe edits notes.

**What the host owns:**
- the app's lifecycle and windows;
- the app menu and global shortcuts;
- native dialogs (open folder, save);
- deep links;
- the Keychain;
- the local server process (D4);
- the Servo embedding: rendering, input, IME, clipboard and embedder
  controls (D2);
- the bridge to the page, through the server (D5);
- native surfaces (D6).

**Native surfaces start in their own windows.** Until Servo's frames are
drawn inside GPUI's scene (D2, step 2), the page sits in a child view that
GPUI cannot draw over. GPUI content above the page uses popup windows until
then.

**Alternatives considered.**
- **The system web view (`gpui-webview` over WKWebView).** It was this plan's
  earlier recommendation. The owner chose Servo, which gives the host control
  over requests, input, rendering and storage, and lets agent co-browsing use
  the same engine as the main window.
- **Tauri v2.** Tauri's event loop (Tao) and GPUI's each need to own the
  macOS main thread, so Tauri cannot host GPUI surfaces. That holds for
  `tauri-runtime-servo` too.
- **Native GPUI chrome around web panels** (the attached analysis's earlier
  pass). It rebuilds the rail, sidebar, dock and composer in Rust, the second
  frontend this plan avoids. It would also split state across several web
  views, because separate pages do not share one zustand store.
- **GPUIX for the interface.** This has the same duplication, in React, and
  nested scrolling is unsupported.

### D2. The web engine: Servo 0.7, from Theorem's fork

**The dependency.**
- `servo` from `https://github.com/Travis-Gilbert/servo` at revision
  `b9d6db9eb26409c2bebab03cb8845be616d4df92` (branch
  `servo07-browser-20261013`, based on upstream v0.7.0). It is the same pin
  and feature set as Theorem's `apps/browser`:
  - `webcrypto`, because note canonicals hash with `crypto.subtle`;
  - `webgl`;
  - `brotli-compression-stream`.
- `desktop/Cargo.lock` is seeded from Theorem's `apps/browser/Cargo.lock`, so
  Servo's dependencies resolve to the versions Theorem validated.
- SpiderMonkey comes from `mozjs_sys`'s prebuilt archive.
- One `rust-toolchain.toml` in `desktop/` (Rust 1.97.1, Servo's) serves both
  Servo and `gpui-pre`.
- **One carried patch so the two graphs resolve together.** GPUI's
  `zed-font-kit` requires `freetype-sys` 0.20, and Servo's `servo-fonts`
  requires 0.23. Both declare `links = "freetype"`, and Cargo allows one such
  package per graph across every target. The host carries `zed-font-kit` with
  those two requirements raised, in `desktop/vendor/zed-font-kit`.
  `open-gpui-font-kit` made the same move upstream. macOS links neither
  FreeType.
- A Servo change the app needs goes into Theorem's fork, and the app moves
  its pin.

**One engine instance.**
- The host builds one `Servo` at startup and spins its event loop from the
  GPUI main thread. An `EventLoopWaker` posts a wake-up through GPUI's
  foreground executor.
- `Opts.config_dir` points at the app's data directory, so `localStorage`,
  IndexedDB and cookies survive relaunches.

**Rendering, in two steps.**
1. **A child view (Phase 0).**
   - The host adds a child `NSView` under the GPUI window's view and gives
     its handle to a `WindowRenderingContext`. This is the path servoshell
     uses.
   - On `notify_new_frame_ready` the host calls `paint` and `present`.
   - It resizes the context and calls `set_hidpi_scale_factor` when the
     window changes.
   - GPUI cannot draw over this view in the same window. Popups, dialogs and
     menus that must cover the page open as GPUI popup windows.
2. **Inside GPUI's scene (the Phase 0 spike, then Phase 1).**
   - A rendering context whose front buffer is a surfman `IOSurface`.
   - The host wraps that `IOSurface` as a `CVPixelBuffer`
     (`CVPixelBufferCreateWithIOSurface`) and paints it with
     `gpui::surface()`.
   - This needs a BGRA path in `gpui-pre-apple`'s Metal renderer. The app
     writes it and carries it as its own patch through `[patch.crates-io]`.
     It is not offered upstream.
   - Once it works, the page is an element like any other: GPUI overlays,
     clipping and in-window native regions all work, with no extra window.

`SoftwareRenderingContext` with `read_to_image` (the `iced_servo` approach)
is not used for the main window, because it copies every frame through the
CPU.

**What the host does for Servo.**
- **Input.** GPUI mouse, wheel and key events become Servo `InputEvent`s:
  - `MouseButton`, `MouseMove`, `MouseLeftViewport` and `Wheel`;
  - `Keyboard`, with GPUI keystrokes mapped to `keyboard-types` keys and
    codes, following servoshell.

  Keys the page does not handle come back through
  `notify_input_event_handled` and reach the app's own shortcuts.
- **IME.** Servo's input-method control reports the focused field's text,
  insertion point and position. The host implements GPUI's input handler
  over it (marked text and bounds for the candidate window) and sends
  `ImeEvent::Composition` and `ImeEvent::Dismissed`. Crepe needs this for
  composed input.
- **Cursor and focus.** `notify_cursor_changed` sets GPUI's cursor style, and
  GPUI focus calls `set_focused`.
- **Clipboard.** A `ClipboardDelegate` over GPUI's clipboard. The Edit menu
  sends Servo's editing actions.
- **Embedder controls**, drawn with GPUI Kit components:

  | Control | How the host draws it |
  |---|---|
  | `<select>` menu | a popup window with a list, at the control's position |
  | color picker | a popup window with a color picker |
  | file picker | the system open panel through GPUI's path prompt |
  | `alert`, `confirm`, `prompt` | a GPUI Kit `Dialog` |
  | context menu | a popup menu with Servo's items |

- **New windows.** `request_create_new` is refused. Its URL opens in the
  system browser.
- **Accessibility.** Servo's AccessKit tree updates are forwarded to an
  AccessKit macOS adapter on the page's view (Phase 1).

### D3. Calling Theorem: the SDK, through the local server

**The SDK.**
- The page keeps using `TheoremClient` exactly as it does on the web.
- On the desktop, `window.location.origin` is the local server, whose proxy
  adds the bearer token. So `client.ts` and the proxy do not change.
- The token never reaches page JavaScript. This keeps the boundary the
  attached analysis asked to preserve.

**Sign-in.**
- **The flow** is OAuth PKCE through `oauth4webapi`, as the Theia plan
  specifies, and the local server runs it.
- **The browser step.** The host opens the authorization page in the system
  browser, and the redirect returns to a loopback route on the local server
  (the native-app pattern from RFC 8252).
- **Token storage.**
  - Only the host binary touches the Keychain, through the
    `security-framework` crate.
  - At launch it passes the refresh token to the server over the server's
    stdin control channel.
  - When the server rotates the token, it reports the new one back the same
    way.

  This avoids `Bun.secrets`, which is open to Bun issue #28071: secrets saved
  by one Bun script are readable by another.

**Other modes.**
- The static `THEOREM_API_TOKEN` from `.env` stays as the development path.
- The web deployment is unchanged.
- Known gap carried over from the Theia plan: an OAuth token admits only the
  home project (`chat_project_scope_refused`). See Backend changes.

### D4. The local server and its boundary

**What runs.**
- The host starts Theorem UI's production server (`.output/server/index.mjs`)
  as a child process, with a bundled Bun runtime, bound to `127.0.0.1`.
- It restarts the server if it exits and stops it on quit.
- The server runs in desktop mode, which adds the workspace routes (D16) and
  the bridge routes (D5). The web deployment never enables them.
- The host and the server talk over the server's stdin and stdout, as
  newline-delimited JSON messages. This control channel carries the launch
  secret, credentials (D3) and bridge calls (D5).

**A stable origin.**
- The port is chosen on first launch and kept in app data, so the page's
  `localStorage` (layout, shell preferences) survives relaunches.
- A new port is chosen only if the stored one is taken.

**Only the app's own web view can use the server.**
- Per launch, the host generates a random secret and passes it over stdin.
- The Servo web view opens `http://127.0.0.1:<port>/desktop/session?secret=…`,
  where the server swaps the secret for an `HttpOnly`, `SameSite=Strict`
  cookie and redirects.
- Every request must carry that cookie, and a `Host` header of exactly
  `127.0.0.1:<port>`.

That shuts out:
- other local processes;
- pages open in the person's browser;
- DNS-rebinding attacks.

**Why a loopback server rather than a custom scheme.** Servo could serve the
app itself: `servo::protocol_handler` registers schemes, and
`load_web_resource` can intercept requests and stream bodies. The loopback
server stays because:
- it is the same server the web deployment runs, so routes, the SDK proxy and
  run-event SSE have one code path;
- block iframes need a second origin, which a second listener provides
  (D9);
- Phase 0 compares Servo and Chrome on the same URL.

**Navigation.**
- `request_navigation` lets the top frame load only the app origin, and
  iframes load only the app origin or the block listener.
- Other links open in the system browser.

**Packaging.** cargo-packager builds `Theorem.app` and a `.dmg` holding:
- the host binary, with Servo linked in;
- the Bun runtime;
- `.output`.

The Bun runtime is the official signed build, re-signed with the app's
identity.

### D5. The host bridge, relayed by the local server

**Transport.**
- **Page to host.** The page sends a JSON-RPC 2.0 request with `POST` to
  `/desktop/host/rpc` on the local server. The server passes it to the host
  over the control channel (D4) and returns the host's reply as the HTTP
  response.
- **Host to page.** Events, such as a file saved in the native editor, reach
  the page as a server-sent event stream at `/desktop/host/events`.
- On the TypeScript side, `json-rpc-2.0` (npm) handles request ids and
  errors.
- The message types are generated from the host's Rust command enum with
  `ts-rs`, so the two sides cannot drift.

**Why through the server.**
- The cookie and `Host` check (D4) already guard everything the page can
  reach, so the bridge needs no second authority check.
- Nothing is injected into the page.
- It does not depend on the engine. Phase 0's Chrome comparison runs against
  the same server with a stub host.

Not chosen: a custom scheme or an intercepted path answered by the host
through `load_web_resource`, with `evaluate_javascript` for events. That is
one hop shorter, but it puts a second authority check in the host and ties
the bridge to Servo.

**The page side.**
- `src/lib/desktop/host.ts` exposes typed calls.
- It is absent on the web, where features check for it and hide desktop-only
  controls.

**Authority.**
- The server accepts bridge requests only with the session cookie and an
  `Origin` header equal to the app origin.
- Live blocks and artifacts run in opaque-origin iframes from the block
  listener (D9). Their requests carry `Origin: null` and no cookie, so they
  never reach the bridge.

**First calls:**
- `pickFolder`
- `openNativeEditor(path)`
- `revealInFinder(path)`
- `openExternal(url)`
- `setDocumentEdited`
- `notify`

### D6. Native surfaces

Native surfaces are optional and added one capability at a time. Each one
opens from the page through the bridge.

1. **A native editor window** (Phase 0).
   - It uses GPUI Kit's `input` code editor for a file in the workspace.
   - Saving writes the file. The workspace watcher (D16) then updates the
     page.
2. **GPU visualization surfaces**, where a workload needs them. They come
   later and are each argued for on their own.
3. **A co-browsing surface** (Phase 8).
   - A second web view on the same Servo instance, in its own window.
   - Theorem drives it through the embedding API:
     - input through `notify_input_event`;
     - pictures through `take_screenshot`;
     - script through `evaluate_javascript`;
     - requests observed through `load_web_resource`.
   - The person and the agent see and use the same page.
4. **Dynamically supplied native panels** through GPUI Shell, using its
   default-deny capabilities and `HostModule` boundary. They are adopted only
   when a panel needs to be native and supplied at runtime.

Each surface starts as its own window. An in-window region comes only after
Servo's frames are drawn inside GPUI's scene (D2, step 2).

### D7. Where content lives: file bytes are truth, the graph keeps history

- **Content.** The bytes of a file on disk are its content.
- **History and provenance.** Theorem keeps each revision with its author,
  through Documents v2 revisions:
  - a person in Theorem UI;
  - an agent run, by run id;
  - an external edit picked up by the watcher.
- **Theorem writes.** It writes the file first (atomic write, then rename),
  then records the revision with its author.
- **External edits.** The watcher records each external edit as a
  `reconcile` revision, the term the Theia plan uses for checkout changes.
- **Indexes and caches** are derived and can be rebuilt from the files.
- **Not every workspace reaches Theorem.** A `LocalOnly` workspace (D12)
  keeps its history locally only.

This is a contract change for Theorem's backend: today its documents have no
file paths and the graph is their home. See Backend changes.

### D8. Identity and folder layout

**Ids.**
- Every workspace entry has an id, `vf_<ULID>`, kept in a sorted path-to-id
  map in `.theorem/ids.json`. The map travels with the folder through git or
  sync.
- Ids are never written into user files by default.
- A `theorem-id` frontmatter key is honored when present, for files moved
  between workspaces.

**Renames.**
- A delete followed by a create with the same content hash inside the
  debounce window counts as a rename, and the id follows the file.
- Links are rewritten on rename.

**Spaces.** A Space can place a workspace file through the existing
`ObjectRef` type, as `{ kind: "workspace-file", id }`.

**Layout.**
- `.theorem/` holds user-owned configuration only:
  - `workspace.json`, which holds the workspace id (`ws_<ULID>`);
  - `ids.json`;
  - workspace settings (attachments folder, daily-note folder and template);
  - handler settings.
- These live in the app data directory, keyed by workspace id, so iCloud,
  git or Dropbox never sync caches:
  - the index;
  - the compile cache;
  - last-run values;
  - per-file Loro documents;
  - folder trust (D9). Trust stays out of the folder so that a cloned or
    synced folder cannot arrive already trusted.

### D9. Live blocks: format, runtime and sandbox

**Format.** Live content stays readable Markdown everywhere else: git, other
editors, an agent.
1. **Tool embeds come first.** `![[Tools/Habit tracker.tsx]]` renders the
   tool file live. The index resolves the reference by id, so renaming the
   tool does not break the note.
2. **Inline live code** uses the brace-attribute fence convention from Quarto
   and marimo:

   ````md
   ```tsx {.live #streak}
   const rows = await files.csv("Data/habits.csv")
   display(<Streak rows={rows} />)
   ```
   ````

   A fence without `.live` stays an inert code block. `#id` names the block's
   value so other blocks can depend on it.
3. **Query blocks** are ```` ```query {.live #id} ```` fences with a YAML
   body. They drive table, list and calendar views. The schema borrows
   Obsidian Bases' documented filter, formula and view model, with no promise
   of compatibility.
4. **Agent blocks** are ```` ```agent {.live #id} ```` fences with a YAML
   body. The body sets:
   - the prompt;
   - the inputs, given as block ids or paths;
   - the trigger (manual or scheduled);
   - the output path.

   The block shows the latest run's status and result.
5. **Pinned output.** An optional snapshot can be pinned between
   `<!-- theorem:output #id -->` markers, so a reader without Theorem still
   sees a result.

**In the editor.**
- Crepe's code-block preview is sanitized to static HTML, which is why
  today's `theorem-embed` cards cannot be live. Live blocks therefore get
  their own node:
  - a `$node` with `parseMarkdown` and `toMarkdown`, so the fence round-trips
    byte for byte;
  - a `$view` that mounts a React node view through `@prosemirror-adapter/react`.
- Its parser `priority` is set above Crepe's `code_block`. The default is 50,
  from `NodeSchema.priority` in `@milkdown/transformer`.
- Wikilinks, embeds and callouts parse through remark plugins chosen at the
  sourcing gate. Candidates: `@flowershow/remark-wiki-link` and
  `@r4ai/remark-callout`.

**Reactivity.**
- A tool file or `.live` fence is a cell.
- `@observablehq/notebook-kit` parses each cell and finds its references.
- `@observablehq/runtime` keeps the dependency graph, so a change recomputes
  only the cells downstream of it.
- **Pure blocks** recompute when an input changes, like a spreadsheet.
- **Effectful blocks** run only on an explicit trigger. These are:
  - agent blocks;
  - scripts that write files or reach the network;
  - anything that needs host execution.

  Each trigger becomes a run (D10).

**Compilation.**
- Sucrase strips TypeScript and JSX in a Web Worker.
- Imports resolve through an import map of exact-version esm.sh URLs with
  `integrity`. The map is vendored into the app for offline use.
- Output is cached by the SHA-256 of the source, the compiler version and the
  import map.
- esbuild-wasm is kept for one job only, exporting a tool as a standalone
  bundle. For transform-only work it is much slower and much larger.
- Formulas from the Embark layer run in QuickJS through `quickjs-emscripten`
  inside a worker.

**Shared state.**
- Each workspace has one Loro state document. Blocks read and write named
  collections in it through the capability bridge.
- The workspace service persists the document, and it follows the
  workspace's sync policy (D12).

**Sandbox.**
- **Isolation.**
  - Each block runs in its own `sandbox="allow-scripts"` iframe, without
    `allow-same-origin`, which gives it an opaque origin.
  - Its document comes from a second loopback listener, so it is a different
    origin from the app.
  - CSP is `default-src 'none'`. Scripts may load only from that listener and
    the pinned import-map hosts.
  - `connect-src 'none'` applies unless the block declares network access.
- **Capability bridge.** A typed RPC over `MessageChannel` serves only what
  the block declares in its header. Example declarations:
  - `files.read("Data/*.csv")`
  - `state("habits")`
  - `net("api.weather.gov")`
  - `run("agent:#summary")`

  The page checks every call against the declaration, and values must be
  structured-clonable. Blocks never reach the host bridge (D5).
- **Trust.** A folder's tools run only after the person trusts that folder.
  Until then a block shows its source and a "Trust this folder" control.
  Folders that arrive from elsewhere start untrusted.
- **The web deployment** serves blocks from a separate block subdomain with
  the same attributes. Blocks therefore run in a phone browser too.

### D10. Runs

**What a run records.**
- the source path and content hash;
- the revision of each dependency;
- an inputs digest;
- the trigger;
- status;
- output references.

**Where runs live.**
- Explicit-trigger runs are durable harness runs: `harness:run:{id}` with
  `harness:event:{id}:{seq}`, replayed through `/v1/theorem/agent/stream`.
- A run is independent of any view. Closing the note does not stop it, and
  reopening shows its status.

**Where runs execute.**
- **Synced workspaces:** remotely through `codemode-kernel` (`exec` and
  `wait`).
- **`LocalOnly` workspaces:** a local runner in the host executes them,
  confined to the workspace folder.
  - The OS sandbox library is chosen at the sourcing gate. Candidate:
    `birdcage`, which uses Seatbelt on macOS and Landlock on Linux.
  - Their run records stay in the local index.

**Outputs.**
- Outputs are written as workspace files to the block's declared path, or to
  `Outputs/<run-id>/`, and recorded on the run by hash.
- Binary outputs need an artifact store. Today Documents v2 refuses
  `Artifact` bodies.

### D11. Life-agent journal

**The file.**
- `Agent/Journal/YYYY-MM-DD.md` is a projection over durable run records,
  regenerated idempotently.
- Each run's section sits between `<!-- theorem:run harness:run:<id> -->` and
  `<!-- /theorem:run -->` markers.
- The agent writes only inside its markers. Anything the person writes
  outside them is authored content and survives every regeneration.
- A section can use live blocks.

**The write op.**
- `SessionRegime::SoloTask` excludes file editing: `namespace.rs:101-110`
  asserts there is no `edit_file`, `write_file` or `terminal`.
- A narrow `journal_append` op is added for the agent's own run section, and
  the assertion is updated to allow that one op.

### D12. Sync and the phone

**Shape.**
- One Loro document per file, plus a directory document that maps ids to
  paths. This is the pushwork shape.
- On a watcher event the workspace service:
  1. normalizes line endings to LF;
  2. skips its own writes by content hash;
  3. applies the change as a local edit with `LoroText.update` (or
     `updateByLine` for large files).
- Canvas JSON is diffed by node and edge id into Loro maps.
- Relay 0.8.12's disk ingestion is the reference design.
- The sync code is TypeScript over `loro-crdt`, shared by the desktop server
  and the web deployment.

**Transport.**
- **Markdown and text** sync as `theorem-document/2`. The canonical body is
  the file's Loro snapshot and `markdownProjection` is the file's bytes.
  This reuses Documents v2's revisions, `If-Match` and change feed, and
  today's note code already builds these bodies.
- **The directory document** syncs as its own document.
- **Binary files** sync as blobs once the artifact store exists.

**Policy.**
- Each workspace has a replication policy, modeled on Theorem's
  `DesktopRoot` and `ReplicationPolicy`:
  - **`LocalOnly`** never leaves the device, and host agents cannot see it.
  - **`Synced`** goes through the Theorem authority, and agents can work in
    it.
  - **`ConnectedLive`** adds live collaboration.

**The phone** runs the web deployment as an installed web app:
- the synced copy is kept in OPFS;
- a service worker keeps it available offline;
- notes are edited in Crepe;
- pure live blocks run, because blocks are web code;
- effectful blocks trigger remote runs.

Selective availability:
- pinned folders and recent files stay local;
- other entries list from the directory document and download on open;
- offline edits merge on reconnect.

A native phone app is out of scope.

**E2EE.**
- There is none in Theorem today.
- An end-to-end encrypted workspace would have to be `LocalOnly` for agent
  purposes.
- This plan documents the implication and does not build E2EE.

### D13. File handlers

**The registry.** Every file type opens through a handler. Each handler
provides:
- **`match`** for an entry (extension, MIME type, frontmatter);
- **`Panel`**, a Dockview panel;
- **`Card`**, its canvas presentation at a given zoom;
- **`create`** (optional), for a new file of that type.

The shape follows Patchwork's tools and datatypes. Third-party handlers load
through the block sandbox (D9).

**Built-in handlers.**

| Type | Panel | Card |
|---|---|---|
| `.md` | Crepe with wikilinks, embeds, callouts, frontmatter properties, live blocks | title and excerpt; live editor above 0.6x zoom (existing behaviour) |
| `.canvas` | React Flow over JSON Canvas 1.0 | thumbnail |
| executable graph | React Flow with run controls (D14) | thumbnail with last-run status |
| `.js` `.ts` `.tsx` `.py` | CodeMirror 6 with a Run control and last-run values in the margin; "Open in native editor" on the desktop (D6) | file name and last-run status |
| `.tsx` app, `.html`, folder with `index.html` | sandboxed iframe (D9) | live at high zoom, snapshot below |
| `.csv` `.json` | table or tree (library chosen at the sourcing gate) | first rows |
| `.pdf` | `pdfjs-dist` | first page |
| image, audio, video | native HTML elements | thumbnail |
| unknown | metadata card plus "Open with", through the host bridge | metadata card |

### D14. Executable graphs

- An executable graph is a `.canvas` file whose nodes carry `theorem:kind`
  (`input`, `tool`, `agent`, `output`).
- Edges carry the data dependencies.
- JSON Canvas allows flat namespaced extra keys. Values stay scalar, to avoid
  the 2024 corruption bug with object-typed properties.
- Running the graph:
  - pure nodes recompute through the same runtime as live blocks (D9);
  - effectful nodes run as harness runs (D10).
- Ordinary canvases are executable graphs with no `theorem:kind` nodes.

### D15. Canvas files

- **Workspace canvases** are `.canvas` files in JSON Canvas 1.0, rendered with
  React Flow.
- **Project Spaces** (`space:project:<id>`) stay server records, as the
  infinite-canvas milestone built them. "Export to folder" writes one as a
  `.canvas` file.

### D16. Folder workspace

**What it opens.** Any folder on the machine, chosen through the native
folder picker (D5). It supports the way of working Obsidian made familiar:
- Markdown files;
- wikilinks, including heading links and block links (`#^id`);
- embeds;
- backlinks;
- tags and frontmatter properties;
- daily notes;
- an attachments folder;
- canvases;
- other files beside them.

**Where it runs.** The workspace service runs in the local server, in
TypeScript:
- `@parcel/watcher`;
- the atomic writer;
- ids and links;
- the index in `bun:sqlite` with FTS5;
- per-file Loro documents;
- sync.

**How the page reaches it.** Through desktop-only server routes. The routes
serve only folders the person opened through the picker.

**What it does not do.** It does not read Obsidian's `.obsidian/`
configuration or run Obsidian plugins.

### D17. SDK surfaces

**Server-backed surfaces.** These go into the Fern-generated
`@theoremharness/sdk`:
- documents and sync;
- runs and artifacts;
- journals.

This repo vendors 0.3.0 today. `packages/theorem-sdk` 0.4.0 lives only on
Theorem's `claude/theia-sdk-live-session` branch and merges to Theorem main
first.

**The tool-author surface** is the block capability bridge (D9) plus
file-handler registration, with generated TypeScript declarations.

**The host bridge (D5) is not public.** It belongs to the app.

## Data ownership

| What | Authority | Notes |
|---|---|---|
| Authored files (notes, canvases, tools, data) | the file on disk | merged across devices through per-file Loro documents |
| Revision history and provenance | Theorem, through Documents v2 | `LocalOnly`: local index only |
| Ids | `.theorem/ids.json` | synced with the folder |
| Index (links, backlinks, tags, properties, headings, tasks, search) | derived | `bun:sqlite` with FTS5 in app data, rebuildable |
| Last-run values | derived | app data, content-hashed |
| Block shared state | per-workspace Loro state document | follows the workspace's sync policy |
| Runs | Theorem harness run log | `LocalOnly`: local index |
| Run outputs | workspace files | referenced from the run by hash |
| Journal | projection of run records | text outside markers is authored and authoritative |
| Page storage (layout, preferences) | Servo's `config_dir` in app data | keyed by the stable origin |
| Credentials | macOS Keychain, through the host | never in page JavaScript |

## Architecture

```
GPUI host (desktop/, Rust)  windows, menus, dialogs, Keychain, deep links,
                            local runner, native surfaces (editor window,
                            later GPU views, co-browsing, Shell panels)
  Servo 0.7 (one instance)  input, IME, cursor, clipboard, embedder controls
                            drawn by GPUI Kit; config_dir in app data
    main web view           Theorem UI, unchanged React app; child view
                            first, then a GPUI surface element
      block iframes         opaque origin, second loopback listener,
                            MessageChannel capability bridge
    co-browsing web view    driven by Theorem (Phase 8)
  control channel           stdin/stdout JSON to the local server: launch
                            secret, credentials, bridge calls
local server (Bun, child)   .output/server/index.mjs on 127.0.0.1:<stable port>
                            Theorem proxy (bearer injected here), OAuth,
                            bridge relay (/desktop/host/rpc, /events),
                            workspace service (watcher, ids, links, index,
                            Loro docs, sync), desktop-only routes
Theorem authority           threads, runs, approvals, Documents v2, harness
                            runs, codemode-kernel, life agent
Web deployment              the same app and server, no workspace or bridge
                            routes; phone as installed web app with OPFS
```

## Reuse map

| Need | Reuse | State |
|---|---|---|
| The interface | this repo's React app | shipped |
| Native app, windows, dialogs, popups | GPUI Kit 0.8 (`gpui-pre` 0.3.9) | published |
| Web engine | `servo` 0.7 with `webcrypto`, `webgl`, `brotli-compression-stream` | Theorem's fork, git rev `b9d6db9e` |
| Page frames inside GPUI's scene | `gpui::surface()` with a BGRA path in `gpui-pre-apple`; surfman `IOSurface` | published; renderer patch written and carried by the app |
| Input translation | servoshell's platform-to-Servo event code | reference, Servo repository |
| Accessibility | Servo's AccessKit tree, AccessKit macOS adapter | crates.io |
| Native editor window | GPUI Kit `input` editor | published |
| Co-browsing engine | the same `servo` instance | crates.io |
| Native scripted panels | GPUI Shell | published, M0 |
| Packaging | cargo-packager | crates.io |
| Keychain | `security-framework` | crates.io |
| Bridge typing | `ts-rs`, `json-rpc-2.0` | crates.io, npm |
| OAuth PKCE | `oauth4webapi` | npm; Theia plan |
| File watching | `@parcel/watcher` | npm |
| Index and search | `bun:sqlite` with FTS5 | Bun |
| Live-block runtime | `@observablehq/runtime`, `@observablehq/notebook-kit`, Sucrase, `quickjs-emscripten` | npm |
| Editor node views | `@prosemirror-adapter/react` | npm; core installed through Crepe |
| Revisions, `If-Match`, change feed | Documents v2 | Theorem main; no paths, no artifact bodies |
| Loro canonical bodies | `src/lib/theorem/note-canonical.ts`, `notes.ts` | this repo |
| Durable runs | `theorem-harness-core` `RunState` and `EventState` | Theorem main |
| Remote execution | `codemode-kernel` | Theorem main |
| Local execution sandbox | `birdcage` (candidate) | crates.io |

## Backend changes in the Theorem repo

These are changes to Theorem's backend, which the app calls. Theorem's rules
apply to them there.

1. **Documents v2.**
   - Accept workspace kinds: `workspace-file` and `workspace-directory`.
   - Record revision authorship: run id for agent writes, `external` for
     watcher reconciles.
2. **Artifact store.** Binary attachments and run outputs need blobs.
3. **Life agent.** Add `journal_append` to the Solo regime and update the
   `namespace.rs` assertion.
4. **Run records.** Add source revision, dependency revisions, inputs digest
   and output references wherever `RunState` lacks them.
5. **SDK.** Merge `packages/theorem-sdk` to main, then add the D17 surfaces.
6. **OAuth scope.** Lift the home-project-only limit on OAuth tokens.

## Phases

Each phase says how it is verified.

**Phase 0: the proof** (the attached analysis's milestone, sharpened).
1. **The app runs.**
   - The host builds with Theorem's Servo 0.7 fork and `gpui-pre` 0.3.9 on
     one toolchain.
   - It opens a GPUI window with Servo in a child view (D2, step 1), starts
     the local server and loads Theorem UI through the launch-secret
     handshake.
2. **The embedder layer works:** input, IME, cursor, focus, clipboard and
   every embedder control in D2.
3. **Conformance in Servo 0.7,** compared with Chrome on the same build:
   - **Chat:**
     - send a message and watch the stream;
     - reload during a run and see it resume;
     - approve a tool;
     - open an artifact and pin a revision;
     - switch threads;
     - relaunch and get the layout back.
   - **React Flow:** drag, connect, pan, zoom, keyboard.
   - **Crepe:** typing, IME, selection, clipboard, the `/` menu.
   - **Dockview:** drag, resize, focus.
   - **Rendering:** Mermaid and Shiki.
4. **Each gap gets a disposition:**
   - fix in Theorem UI, where the app relies on something nonstandard;
   - fix in Servo, upstream or in Theorem's fork, carried through
     `[patch.crates-io]` until released;
   - fix in the host, where the gap is embedder work.
5. **One native capability end to end:**
   - pick a folder through the bridge;
   - open a file from it in a native editor window, save, and see the page
     update;
   - show that an iframe cannot reach the bridge;
   - show that a page in another browser cannot reach the server.
6. **The in-scene spike** (D2, step 2):
   - Servo's `IOSurface` frames are painted with `gpui::surface()` through
     the BGRA renderer patch;
   - a GPUI overlay draws above the page in the same window;
   - frame times are compared with the child view.

Verify: a written Servo-versus-Chrome comparison per component, with each
gap's disposition, and the spike result, both kept with this plan. The
comparison is `docs/desktop/conformance.md`.

**Phase 1: a shippable app.**
- OAuth sign-in, with the Keychain in the host and credentials handed to the
  server.
- Restart of the server process if it dies.
- The main window on the in-scene renderer, if the spike passed.
- Accessibility through AccessKit.
- A signed `Theorem.app` built with cargo-packager.
- The menu bar and shortcuts.
- Deep links.

Verify:
- signing in works;
- the token never appears in page JavaScript;
- VoiceOver reads the chat transcript and the composer;
- the app runs from the `.dmg` on a clean machine;
- the web deployment still works.

**Phase 2: folder workspace core.**
- Build:
  - the workspace routes;
  - the watcher;
  - the atomic writer and own-write suppression;
  - ids and rename tracking;
  - link rewriting;
  - the index;
  - the file tree.
- Verify:
  - an existing folder of Markdown opens;
  - an edit made in another editor appears after the debounce;
  - a rename keeps the id and rewrites links;
  - the index rebuilds from nothing.

**Phase 3: handlers and canvas files.**
- Build the registry, every built-in handler in D13, and `.canvas` files.
- Verify:
  - each type opens in a panel and as a card;
  - a JSON Canvas file round-trips unchanged.

**Phase 4: live blocks.**
- Build:
  - the Crepe node;
  - tool embeds;
  - `.live`, `query` and `agent` fences;
  - compilation;
  - the dependency runtime;
  - the sandbox and capability bridge;
  - folder trust;
  - the state document;
  - last-run values;
  - the Embark layer.
- Verify:
  - `Today.md` embeds a habit-tracker tool and a fence that reads a CSV;
  - editing the CSV recomputes only the dependent blocks;
  - a block without a declaration cannot read the folder;
  - an untrusted folder does not execute;
  - the fence round-trips byte for byte.

**Phase 5: runs and executable graphs.**
- Build:
  - explicit-trigger blocks;
  - harness run records;
  - remote execution;
  - the local runner;
  - outputs;
  - the runs panel;
  - executable `.canvas` graphs.
- Verify:
  - a run continues after its note closes;
  - reopening shows its status and output;
  - the run record names its source and dependency revisions.

**Phase 6: journal.**
- Build the projection, the markers and `journal_append`.
- Verify:
  - an agent run adds its section to today's journal;
  - text the person wrote outside the markers survives regeneration.

**Phase 7: sync and phone.**
- Build:
  - per-file Loro documents over Documents v2;
  - the directory document;
  - replication policy per workspace;
  - selective availability;
  - the web deployment's workspace views, OPFS copy and offline service
    worker.
- Verify:
  - after sync, `Today.md`, its tool, the result file and the journal entry
    open offline in the installed web app on an iPhone;
  - the tool runs there;
  - a phone edit and a concurrent desktop edit merge.

**Phase 8: more native surfaces.**
- Build:
  - the co-browsing window, a second Servo web view Theorem can drive;
  - GPUI Shell panels, if a panel needs to be native;
  - in-window native regions, once the main window renders in GPUI's scene.
- Verify: an agent and the person browse the same page in the co-browsing
  window.

**Phase 9: SDK surfaces.**
- Publish the D17 surfaces.
- Write a third-party handler and a tool using only the public surface.
- Verify: that handler and tool load.

## First end-to-end target

1. `Today.md` holds a live fence and an embedded tool (`![[Tools/Habit
   tracker.tsx]]`). Delivered in Phase 4.
2. An agent block in it runs and writes `Outputs/<run-id>/summary.md`.
   Delivered in Phase 5.
3. The run adds its entry to `Agent/Journal/<date>.md`. Delivered in Phase 6.
4. On the phone, with the network off, the note, the result file and the
   journal entry all open, and the tool runs. Delivered in Phase 7.

## Risks

- **No one has joined Servo and GPUI before.** The host writes the embedder
  layer itself: input, IME, clipboard, cursor and every embedder control.
  servoshell is the reference. `iced_servo`, the only other non-winit
  embedder, renders through the CPU.
- **Servo's support for the app's libraries is unmeasured in 0.7.** React
  Flow, ProseMirror's `contenteditable` and IME, Dockview, Shiki and Mermaid
  are what Phase 0 measures. Gaps become Servo work, upstream or in Theorem's
  fork.
- **The in-scene renderer needs a GPUI patch.** `gpui-pre-apple` accepts only
  YUV surfaces today. The app carries its own BGRA patch and re-applies it on
  each GPUI Kit upgrade. The child view is the fallback.
- **Servo draws with OpenGL on macOS** (surfman over CGL), which Apple has
  deprecated.
- **Build weight.** Servo and SpiderMonkey make the host large and slow to
  build from clean. The prebuilt SpiderMonkey archive and a shared
  `CARGO_TARGET_DIR` keep rebuilds incremental.
- **Two processes.** The host and the server must start, stop, update and
  fail together, and the server's crashes must be visible.
- **The loopback server is an attack surface.** D4's cookie, `Host` check and
  launch secret address it. Phase 0 tests it from another browser.
- **GPUI Kit churn.** It pins `gpui-pre` exactly, so the app upgrades in step
  with it.
- **Code from other people's folders.** Tools are code. The sandbox and
  folder trust (D9) are the mitigation.
- **Backend contract change (D7).** Theorem services that assume the graph is
  a document's only home must learn about workspace files.

## Not in this plan, and why

- **Rebuilding the interface natively** (native chrome, GPUIX, GPUI Shell as
  the main runtime). One interface, in TypeScript, is the point.
- **E2EE.** Continuous host agents need plaintext. D12 documents the
  implication.
- **Obsidian configuration and plugins.** The goal is folders used the way
  Obsidian is used, not Obsidian compatibility.
- **A native phone app.** The phone uses the web deployment.
- **Windows and Linux as verified targets.** GPUI and Servo support both, but
  the app is verified on macOS first. The in-scene renderer is
  macOS-specific (`IOSurface`), so other platforms start with the child view.
- **Several main windows.** The main window is one web view onto one server.
  A second window would be another Servo web view onto the same server, added
  only when needed.
