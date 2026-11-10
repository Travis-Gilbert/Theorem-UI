# Apps with a database and a compiler

Generated Apps get a browser database that outlives their code, a TypeScript
path that is type-checked in the browser, and a designer where a person and
an agent edit the same running interface. The checklist is
`app-database-and-compiler.checklist.json`.

The owner's design (pasted with the request on 2026-11-10) is the requirement,
together with these decisions:

| Decision                                                                 | Owner's words                                                                |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Standalone RustyRedDB is the shared engine; the browser binding wraps it | "use the standalone, embeddable RustyRed as the shared engine"               |
| The browser binding is a new crate in RustyRedDB                         | `rustyred-web` in Theorem is the crawler; `apps/theoremweb` is being removed |
| tsrs (`@tsrs/wasm`) is the type checker                                  | "the new TypeScript compiler, which was rewritten in Rust to WASM"           |
| Work starts from `main` on `feat/artifact-db-compiler`                   | "yes"                                                                        |
| Plan first, then build, then revise the plan as the build teaches us     | "I would prefer plan, build, and then revise as needed"                      |

## What is true today (read 2026-11-10)

Theorem UI `origin/main` 844e6cd, RustyRedDB `main`, `@tsrs/wasm`
0.23.0-ts7.1.0-beta.

- **A generated App is one HTML file.** The builder emits
  `complete_work.app {title, html}`; the App is a `theorem.app` document and
  runs in an opaque-origin frame (`sandbox="allow-scripts"`) loaded from a Blob
  URL (`hosted-app.ts`, `app-revision-frame.tsx`). TypeScript is compiled only
  for live blocks and desktop tool files, by Sucrase, with no type check
  (`src/lib/blocks/compile.ts`).
- **App state is Loro maps inside the App document.** `state(name)` saves
  through the Documents API, so every save is a document revision
  (`document-app.ts`). There is no browser database and no OPFS use.
- **The frame cannot hold a database.** An opaque origin has no OPFS. Anything
  durable lives in the host page and is reached over the bridge
  (`executor.ts`, `bridge.ts`, `sandbox/protocol.ts`).
- **Hosted Apps report no runtime errors.** Cells return a `RunOutcome`; an App
  frame forwards nothing from `window.onerror` or `unhandledrejection`.
- **Sending problems to the agent has a pattern.** OpenUI's "Ask to fix" builds
  a `repairReference` (`openui/selection.ts`).
- **esbuild-wasm already bundles in the page** against the import map
  (`export.ts`).
- **RustyRedDB compiles for `wasm32-unknown-unknown`** (`cargo check` passes
  for log, engine, query and facade). It has an OPFS log file
  (`rustyred-log/src/opfs.rs`, feature `browser-opfs`) and a chunk store over
  it (`rustyred-engine/src/browser_projection.rs`). It has never run in a
  browser. `Database::create/open` take paths. The journal's group-commit
  thread and ungated `Instant`/`SystemTime` uses would panic at runtime.
- **The engine can report commits** (`attach_commit_observer`,
  `changes_since`); the facade and the Node binding expose neither.
- **Cypher is read-only.** Writes are `mutate` batches. The desktop index
  already uses this vocabulary through `@rustyreddb/node`
  (`src/server/desktop/workspace/index-db.ts`).
- **tsrs works for this use.** Measured in Node: a TSX file with
  `jsx: react-jsx`, virtual `/node_modules/@types/react` and a virtual SDK
  package checks and emits in about 260 ms cold at 111 MiB, and reports the
  planted errors (TS2339, TS2345). It has no transpile-only entry, no watch
  mode, and a fresh instance per call. The module is 10 MB raw, 1.7 MB brotli.
- **Pages and modules exist** (`docs/plans/modular-interface.md`): a module
  contract, a registry, vault-file modules in a sandbox, and Puck layouts.

## The concepts, kept apart

- **App data**: graph records an App reads and writes. Owned by the browser
  database, keyed by the App's document id, so every revision of the App sees
  the same records.
- **App state**: the existing Loro collections. Unchanged. For any one piece
  of durable data, one system owns it; `db` does not mirror `state`.
- **Source revision**: the files of a TypeScript App at one document revision.
  Every build, diagnostic and preview names the revision it came from.
- **Build**: emitted JavaScript for one source revision. A preview shows a
  build.
- **Check**: tsrs diagnostics for one source revision. A preview can be
  running while its check is pending or failing; these are separate facts.
- **Component plugin**: runtime modules, matching declarations, and design
  metadata (what it is for, editable properties, slots, examples).
- **Style book**: tokens, preferred variants, compositions and usage guidance,
  as a folder an agent is told to read in a fixed order.

## Phase 1: RustyRedDB in the browser

In the RustyRedDB repo, a `rustyred-wasm` crate and an `@rustyreddb/browser`
package.

- The crate builds the graph store over `ProjectionChunkStore` on an
  `OpfsLogFile`, and over `MemChunkStore` for tests and for browsers without
  OPFS sync handles. It does not go through `Database::create/open`.
- The JavaScript surface mirrors the Node binding: `open(name)`, `inMemory()`,
  `mutate`, `getNode`, `getEdge`, `queryNodes`, `neighbors`, `query` (Cypher,
  read-only), `designateFulltext`, `fulltextSearch`, `compact`, `close`.
  Errors carry the same stable `code`.
- `subscribe` is new: the worker re-runs a registered read after each commit
  that could affect it and posts the result. First version re-runs every
  subscription on every commit; narrowing by label comes after it is measured.
- The package owns the dedicated worker (OPFS sync handles require one) and
  exposes an async client.
- Runtime panics found by running, not by reading, are fixed in the engine
  behind `cfg(target_arch = "wasm32")`.
- A browser oracle (headless Chromium) proves: write, reload the page, read
  the same records back.

Built and observed on 2026-11-10 (RustyRedDB PR #4), with two exceptions.
Full-text search is not in the browser binding: the engine's index is built
with Tantivy, whose default features do not build for `wasm32`. `compact` is
for native files only.

The browser file is not a native `.RR` file (`docs/compatibility.md`). Moving
data between the two is export and import, and is not in this phase.

## Phase 2: `db` for Apps

In Theorem UI.

- A database worker in the host page, one database per App document id.
- A `db` capability in `Capabilities` and the `// uses:` and
  `<meta name="theorem:uses">` declarations, with `db.*` page methods beside
  `state.*`, each parsed and checked against the declaration.
- `window.theorem.db` in the app bridge, with `subscribe` delivered over the
  existing port.
- A pinned historical revision gets a read-only `db`, as it gets a read-only
  host today.
- The agent learns the surface from the same declaration file the checker uses
  in Phase 3.

- Two tabs showing the same App share one database. The browser gives one
  exclusive handle per file, and a second open is refused (observed in the
  Phase 1 oracle), so one tab owns the worker, chosen with a Web Lock, and the
  others reach it over a `BroadcastChannel`.

This works for today's HTML Apps and does not wait for Phase 3.

Built and observed on 2026-11-10 for conversation Apps, including the shared
database across tabs. `docs/blocks/live-blocks.md` describes it. The
builder's contract documents `db` in Theorem PR #1002; no builder run has
been made with it yet. Still open: the browser store is never compacted, so a
database that is rewritten often grows.

Open question for this phase: App data is local to one browser profile. Whether
and how it syncs to the Theorem server is not decided here; the App document
stays the synced record, and `state` remains the choice for data that must
follow the person across devices until that is decided.

## Phase 3: TypeScript Apps

- A new App form: several source files (`.tsx`, `.ts`, `.css`) in the App
  document, beside the existing single-HTML form, which stays.
- **Build** with esbuild-wasm against the import map (already in the page).
  **Check** with tsrs in its own worker, loaded on first use, against the same
  frozen file snapshot. tsrs is not on the emit path at first; whether it
  should be is measured later.
- The checker's file map carries the declarations for React, each allowed
  import, and `@theorem/app` (`db`, `state`, `files`, `run`), generated from
  the bridge's own schemas so the types and the runtime checks cannot drift.
- Revision discipline: a build or check result is dropped if a newer source
  revision exists; a failed build leaves the last working preview in place.
- The frame forwards `error` and `unhandledrejection` with source-mapped
  positions. Build errors, check diagnostics and runtime errors reach the
  agent as a repair reference naming the source revision.
- Mobile budget: the checker loads only while an App is being edited, one
  checker serves all open Apps, and a check runs on a settled edit, not on a
  keystroke. Verified on a phone before it is called done.

Built and observed on 2026-11-10 (`docs/blocks/live-blocks.md`, "TypeScript
Apps"). What the build decided:

- **The form is one document.** A TypeScript App is an HTML App whose page
  carries its source files as `text/theorem-source` scripts. The builder still
  publishes `{title, html}`, and revisions, pinning and the source editor are
  unchanged. No server change was needed for the form.
- **The declarations come from the bridge's source**, not from its zod
  schemas: TypeScript emits them from `sandbox/app-bridge.ts`, and a test
  fails when the checked-in copy is stale.
- **Only React is typed** among the import map's modules. d3, Plot and the
  rest import untyped.
- **The source map travels in the page**, trimmed to the App's own files, so
  tracing a failure needs nothing but the page.

Still open: the phone measurement, and the builder being told the form
(Theorem repo). No turn has yet been observed in which the agent receives a
repair reference and repairs an App.

## Phase 4: the designer

- **Click to source.** (Built 2026-11-10: the stamp is the place itself,
  `file:line:column`, so there is no index.) The build stamps each JSX element with an id and keeps
  an id to file-and-span index for that source revision. Ids are added at
  build time and are never written into the person's source. (Onlook writes
  them into source; we own the build step, so we do not need to.)
- **Edits as actions.** A small reversible set: set a property, set a token or
  style, insert into a slot, reorder, remove, change a binding, extract a
  component. Each becomes an AST edit on the source revision it was made
  against. Anything outside the set goes to the agent with the selection.
- **Scope is explicit**: this instance, this variant, this component, this
  style book.
- **Gestures stay responsive**: a drag changes a temporary value in the frame
  and commits one source edit on release.
- **Component plugins and style books** are folders in the vault: a manifest,
  declarations, a component inventory, tokens checked against a fixed schema,
  and a usage file the agent reads first. (OpenDesign's layout is the model.)
- A component saved from the designer becomes a plugin entry other Apps can
  import.

## Phase 5: editing Theorem itself

Through the surfaces that already exist: modules, pages and themes
(`modular-interface.md`). A vault module gains the TypeScript path from
Phase 3 and the designer from Phase 4. The host keeps authentication,
routing, persistence and lifecycle; those are not editable surfaces.

## Not in this plan

- Replacing Sucrase for live blocks.
- Hot module replacement that keeps React component state across an edit.
- Typed results for arbitrary Cypher strings.
- Sync of App data between devices (see the open question in Phase 2).
- Converging Theorem's in-repo engine onto RustyRedDB (Theorem PR #865).

## Verification

Each phase closes on something observed, recorded under
`docs/plans/evidence/`:

1. Headless Chromium: records written through `@rustyreddb/browser` are read
   back after a page reload.
2. An HTML App writes records, the agent publishes a new revision, the new
   revision reads the same records; a second view updates without a rebuild.
3. A TypeScript App with a planted type error shows the diagnostic against the
   right revision while the previous preview keeps running; the repair
   reference carries it to the agent.
4. A click in the preview selects the right source span; a property edit and a
   reorder each produce the expected source diff and undo cleanly.
5. A vault module edited in the designer updates on a page without a reload of
   the host.
