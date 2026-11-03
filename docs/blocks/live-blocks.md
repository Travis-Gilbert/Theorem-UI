# Live blocks

Live blocks are code, queries and agents that run inside a folder's notes,
plus tool files and HTML apps that run on their own (plan D9, D13). This page
covers what a person writes, how it runs, and what the code needs from the
rest of the app. The code is in `src/lib/blocks/`, `src/components/blocks/`
and `src/server/desktop/blocks/`. Mentions and per-day formulas, the Embark
layer, have their own page: [embark.md](embark.md).

## What the app registers

`src/lib/blocks/index.ts` exports what the app registers with the handler
registry. Nothing registers these on its own.

- **`blockHandlers`**:
  - `tool`: `.tsx` files, priority 60. The code editor (40) stays available
    in "Open with".
  - `html-app`: `.html` and `.htm` files, priority 60.
  - `html-folder`: folders, priority 10. The handler's match input does not
    list a folder's files, so every folder matches. A folder without
    `index.html` says so in its panel.
  - The tool and HTML app handlers create new files from a template that
    declares nothing.
- **`liveBlocksExtension`**: a `MarkdownExtension` for Crepe. It adds:
  - the `live_block` node, parsed by a remark transformer that runs first;
  - an input rule and the `InsertLiveBlock` command;
  - a React node view, made with the editor's `theoremNodeViewFactory` slice.
- **`blockCodeExtension`**: a `CodeExtension`. For TypeScript and JavaScript
  files it adds two things:
  - last-run values at line ends;
  - a Run control in the toolbar. The file runs as a tool once Run is
    pressed, then reruns when it or what it reads changes.

  Other files get nothing, and the tool views never load for them. Python
  needs host execution, which comes with runs (plan Phase 5).

Each view loads with `React.lazy` the first time it is needed. Registering
the extensions does pull in Milkdown's utilities and `@codemirror/state` and
`@codemirror/view`, because `extend` and `extensions` are synchronous.

## The format

Everything stays readable Markdown, in git, in other editors and for agents.

### Tool files and embeds

A `.tsx` file is a tool: one cell whose default export is the component it
renders. `![[Tools/Habit tracker.tsx]]` in a note embeds the tool. The
Markdown handler shows an embed as the target's card at zoom 0.5. That is
above `LIVE_ZOOM` (0.4), so an embedded tool always runs. On a canvas, a card
zoomed out below 0.4 shows the tool's last snapshot instead.

### Live fences

A fenced code block is live when its info string has a `{…}` attribute block
with the `.live` class. The attribute block is the one Pandoc, Quarto and
remark-attr use, parsed with `md-attr-parser`.

````md
```tsx {.live #streak}
habits.filter((row) => row.done === 1).length
```
````

- **The language** decides what runs the block:
  - `ts`, `tsx`, `js`, `jsx`, `typescript` and `javascript` are code;
  - `query` is a query block;
  - `agent` is an agent block;
  - any other language marked `.live` stays as written, and its view says
    nothing runs it.
- **`#id`** names the block. Other blocks read its value by that name, and
  a code block's name must be a JavaScript identifier for that to work. An
  unnamed block runs, but nothing can refer to it. When two blocks share a
  name, the first keeps it.
- **Other `key=value` attributes** are kept, and nothing reads them yet.
- **A fence without `.live`** is an ordinary code block.

The fence is kept byte for byte. The transformer slices each live fence from
the source with micromark's positions, inside lists and quotes too. The node
keeps that text in its attributes, so an edit rewrites only the fence that
changed. `src/lib/blocks/format.test.ts` checks the round trip for every
fence form.

### Pinned output

A reader without Theorem sees a pinned result, as Markdown between markers
after the fence:

````md
```tsx {.live #streak}
habits.filter((row) => row.done === 1).length
```

<!-- theorem:output #streak -->

`4`

<!-- /theorem:output -->
````

Pin output writes the current value (a GFM table for rows and query results,
otherwise inline code or a sentence). Update pin replaces it, and Unpin
removes it. A block needs a name before it can be pinned. The pinned output
shows in the editor while a block is not running.

### In the editor

Type a fence opener with its attribute block and then a space, such as
` ```tsx {.live #name} `. (A space typed straight after the language
makes an ordinary code block first.) Each block shows:

- its language and name (editing the name rewrites the fence's `#id` and the
  pinned output's marker);
- its status, Run, Pin output, Unpin and Hide code;
- its source in CodeMirror, then its result.

In an untrusted folder a block shows its source and the trust control.

The editor saves through the Markdown handler's debounced save. The block
session reads the saved file, so until that save lands, a block whose name
was just changed shows no result.

## Code blocks and tools

A code fence or a tool file is one cell, compiled for
`@observablehq/runtime`.

- **Top-level declarations** become the cell's values. Other blocks read a
  named block's value by its name, as a variable.
- **A block ending in an expression** shows that value.
  `display(value)` shows more values. React elements render, and anything
  else is shown with `object-inspect`.
- **Top-level `await`** works, and so do imports listed in the import map
  (below).
- **A tool's `export default`** component renders. Other exports are
  unwrapped into plain declarations.
- **Builtins:**
  - `display`;
  - `files`: `text`, `json`, `csv`, `bytes`, `list`, `write`;
  - `state(name)`: a collection with `get`, `set`, `delete`, `keys`,
    `entries`, `snapshot`, `subscribe`, and `use()` as a React hook;
  - `run("agent:#id")`;
  - `invalidation`.

  Any other free name is another block's `#id`.

Compilation runs in a Web Worker. Sucrase strips types and JSX and keeps
every line where it was. notebook-kit finds the cell's inputs and outputs.
acorn and magic-string add the `__trace` calls behind last-run values. The
compiled module is cached by the SHA-256 of the compiler version, the import
map and the source:

- in the page;
- in the workspace's app data (`compiled/<key>.json`, through the
  `compiled` route).

So a block compiles once per source on each machine.

## Declarations

A block reaches exactly what it declares, and nothing without a declaration.
Code blocks and tools declare in leading comments:

```ts
// uses: files.read("Data/habits.csv"), state("habits")
// uses: net("api.weather.gov")
```

HTML apps declare in their entry page:

```html
<meta name="theorem:uses" content='files.read("Data/*.csv"), state("habits")' />
```

The list is parsed with acorn as JavaScript call expressions:

| Declaration                | Allows                                                           |
| -------------------------- | ---------------------------------------------------------------- |
| `files.read("Data/*.csv")` | reading and listing matching workspace paths (picomatch globs)   |
| `files.write("Log.csv")`   | writing matching paths                                           |
| `state("habits")`          | the `habits` collection in the workspace's state document        |
| `net("api.example.com")`   | `fetch` to `https://api.example.com` (the frame's `connect-src`) |
| `run("agent:#weekly")`     | asking for a run of the agent block `#weekly`                    |

Paths stay inside the folder (no leading `/`, no `..`). The page checks every
call against the declarations, parsing each argument with zod.

**Pure and effectful.** A block that declares `files.write`, `net` or `run`
is effectful. It runs only when someone presses Run, and shows "Waiting for
Run" until then. After its source or inputs change it shows "Changed since it
ran". Every other block is pure: it recomputes whenever something it reads
changes, a file it declared or a block it names. Edit `Data/habits.csv` and
only the blocks that read it recompute.

## Query blocks

A query block's body is YAML. The schema borrows Obsidian Bases' `filters`,
`formulas`, `properties` and `views`, and adds `from`. It promises no
compatibility with Bases.

````md
```query {.live #recent}
from: Data/habits.csv
filters: 'done == 1'
formulas:
  hours: 'minutes / 60'
views:
  - type: table
    order: [date, habit, formula.hours]
    sort: [{ property: date, direction: DESC }]
    limit: 3
    summaries: { minutes: Sum }
```
````

- **`from`** is one of:
  - a CSV, TSV or JSON file or glob, one row per record;
  - a glob of notes, such as `Projects/**/*.md`: a row per note, its
    frontmatter as fields;
  - another block, `'#id'`: its rows;
  - `mentions`: this section's mentions;
  - `{ mentions: Heading }`: another section's mentions (see
    [embark.md](embark.md)).
- **`filters`** is an expression, or `and`, `or` and `not` lists of them.
- **`formulas`** are named expressions, read as `formula.name`.
- **`properties`** set display names.
- **`views`** is a list of views, a table by default:
  - `type`: `table`, `list` or `calendar` (FullCalendar);
  - `name`, `filters`, `order`;
  - `sort` and `groupBy` (`direction` ASC or DESC);
  - `limit`;
  - `summaries`: Bases' names, such as `Sum`, `Average`, `Median`, `Range`,
    `Earliest`, `Checked` and `Unique`;
  - `date`: a calendar's date property.

**Expressions** are JavaScript run in QuickJS, never in the page's realm.
Each task gets a 2-second deadline and 64 MiB. A bare name reads the row's
field, and a missing one is `undefined`. Expressions can use:

- `note.`, `formula.`, `mention.` and `this` (the note the block is in);
- `file.` (`name`, `path`, `folder`, `ext`, `size`, `mtime`, `tags`,
  `links`, `hasTag()`, `inFolder()`, `hasLink()`);
- `today()`, `now()`, `date()`, `addDays()`, `daysBetween()`, `list()`,
  `number()` and `sum()`.

A query's value is its views and the first view's rows, so another block can
use it.

## Agent blocks

````md
```agent {.live #weekly}
prompt: Summarize this week's habits in two sentences.
inputs: ["#streak", Data/habits.csv]
trigger: manual
output: Reviews/Weekly.md
```
````

- `prompt` is required.
- `inputs` are block names or workspace paths.
- `trigger` is `manual` (the default) or `{ schedule: "<cron>" }`.
- `output` is where the run writes its result.

The view shows the prompt, the inputs, the trigger and the latest result. Run, and `run("agent:#weekly")` from a block that
declared it, record a request through `src/lib/blocks/runs.ts`. Agent runs
come in plan Phase 5. Until then the result says that nothing ran, and
Phase 5 replaces the requester (`setRunRequester`).

## Trust

A folder's blocks run only once the person trusts the folder.
`WorkspaceClient.setTrusted` keeps trust in app data, never in the folder,
and folders start untrusted. Until a folder is trusted:

- a note's blocks, a tool and an HTML app show their source and a "Trust
  this folder" control;
- the code editor's Run becomes "Trust this folder to run";
- the block listener answers `403` for the folder's cells and apps;
- the compile store refuses writes;
- app links are not issued.

## The sandbox

**Frames.** Every block runs in its own `<iframe sandbox="allow-scripts">`
without `allow-same-origin`, so its origin is opaque.

**Documents.** Its document comes from the block listener, a second
`Bun.serve` on `127.0.0.1:<THEOREM_BLOCK_PORT>`, which is another origin from
the app. The listener:

- answers only requests that name its own host, so a DNS-rebound name gets
  `403`;
- answers only `GET` and `HEAD`;
- serves:
  - `/cell/<ws>/<key>`: a cell's document;
  - `/compiled/<ws>/<key>.js`: its module;
  - `/__runtime/*`: the sandbox runtime;
  - `/vendor/*`: vendored modules;
  - `/app/<token>/<path>`: HTML apps.

**Policy.** Each document gets a Content-Security-Policy:

- `default-src 'none'`;
- scripts only from the listener's runtime, its vendored modules and the
  block's own module, plus the inline import map by hash;
- `connect-src` only for the hosts the block declared with `net`;
- `frame-ancestors` set to the app's origin.

**The bridge.** The frame and the page talk JSON-RPC over a
`MessageChannel`. Only the frame's own window can ask for the port, and only
once. A frame that loads a second document (its code navigated it) is cut
off, and its view offers Reload. Blocks never reach the host bridge.

**Last-run values.** Each top-level value a code block or tool produced is
kept by the SHA-256 of its exact source (`last-run/<hash>.json`). The code
editor shows each value at the end of the line that produced it. An edited
line shows nothing until the code runs again.

**Snapshots.** A frame sends a static copy of itself once it settles after a
change, up to 512 K characters. The copy keeps:

- the document's `<style>` elements;
- form values;
- canvases, as images.

It drops scripts, and stylesheets loaded from elsewhere are not in it. The
page sanitizes it with DOMPurify and keeps the latest 64 in memory, until the
app reloads. A card far out shows the snapshot in a frame with an empty
sandbox, under a policy that loads nothing.

## HTML apps

An `.html` file, or a folder with `index.html`, opens as an app.

- **Loading.** The panel asks the local server for a link to the app
  (`POST /desktop/blocks/app-token`). The link carries a signed token naming
  the workspace and the app's folder. It lasts 12 hours and dies with the
  server; the panel renews it every 6. The listener serves the folder's files
  under that token, never hidden files and never anything above the folder.
- **Pages.** HTMLRewriter reads each page's `theorem:uses` declarations,
  which decide its policy. It adds the import map and the bridge script.
- **The bridge.** The page gets `window.theorem` once `theorem.ready`
  resolves:
  - `theorem.files` (`text`, `json`, `csv`, `bytes`, `list`, `write`);
  - `theorem.state(name)`;
  - `theorem.run(target)`.

  Everything the page reaches is checked against the entry page's
  declarations.

- **Running.** An app runs when it is opened: opening it counts as the Run.
  A change to any file in its folder reloads it.
- **One page.** An app is one page. Following a link to another of its pages
  loads a second document, which is cut off, as for any block. Route inside
  the page instead, with the History API or hash changes. Inline scripts and
  styles are allowed.

## Shared state

Each workspace has one Loro document, `state.loro` in its app data. Each
`state("name")` collection is a `LoroMap` in it.

- The page keeps a replica (`src/lib/blocks/state.ts`). Reads are local.
- Local changes go to `POST /desktop/workspace/<id>/state`.
- Other views' changes arrive over `state-events`, and merge in any order.
- The server saves the document after a burst of changes, and when the
  workspace closes.

**Phase 7.** Sync and the phone replace the transport, `StateTransport`,
with one over Documents v2, and the state document follows the workspace's
replication policy (D12). The replica, the bridge and blocks stay as they
are. Until then, state stays on this machine.

## Export

A tool's Export writes `Exports/<name>.html`. It is one page that runs
anywhere, made with esbuild-wasm in the page. It holds:

- the tool, the sandbox runtime and the vendored modules;
- copies of the files and state collections the tool declared;
- the same policy a block frame has.

`files.write` and `run` are refused in an export.

## The import map

Blocks import only what the import map lists. The listener serves those
modules from the app itself, so nothing in a block reaches a CDN:

- `react` and `react/jsx-runtime` 19.3.1;
- `react-dom/client` 19.3.1;
- `json-rpc-2.0` 1.8.1;
- `object-inspect` 1.13.4.

They are exact-version esm.sh builds vendored by
`scripts/vendor-block-modules.ts`. That script writes:

- `src/lib/blocks/vendor/files/**`;
- the import map with each file's `integrity`;
- each file's source URL and integrity, in `vendor/manifest.ts`.

To add a module, add its specifier and exact esm.sh URL to `ENTRIES`, then
run `bun scripts/vendor-block-modules.ts`. Changing the map changes every
compile key, so blocks compile again.

## The web deployment

The block listener's handler, `createBlockHandler`, is a plain function. The
web deployment still needs:

- a block origin of its own, a separate subdomain, that mounts the handler
  with the same sandbox and policies;
- the compile store, last-run values, state and app tokens behind the web
  deployment's workspaces;
- a `StateTransport` over sync (Phase 7).

Pure blocks then run in a phone browser. Effectful ones wait for remote runs
(Phase 5).

## Where the code is

| Concern                         | Files                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Format, round trip, editor node | `src/lib/blocks/format.ts`, `milkdown.ts`, `output.ts`                                           |
| Compile and cache               | `compile.ts`, `compile.worker.ts`, `compiler.ts`, `vendor/`                                      |
| Graph and sessions              | `runtime.ts`, `session.ts`, `sessions.ts`                                                        |
| Queries and formulas            | `query.ts`, `embark.ts`, `formulas/`                                                             |
| Sandbox                         | `executor.ts`, `bridge.ts`, `sandbox/`, `src/server/desktop/blocks/`                             |
| State, last run, trust          | `state.ts`, `last-run.ts`, `trust.ts`, `src/server/desktop/blocks/state-document.ts`, `store.ts` |
| Views                           | `src/components/blocks/`                                                                         |
| Routes                          | [workspace-routes.md](../desktop/workspace-routes.md)                                            |
| Fixtures                        | `test/fixtures/blocks/`: `Today.md`, `Tools/Habit tracker.tsx`, `Data/habits.csv`                |
