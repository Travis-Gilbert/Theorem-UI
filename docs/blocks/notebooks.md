# Notebook artifacts

An agent can send a notebook as an artifact in either of two forms: Observable
(reactive JavaScript, drawn with D3 or Plot) or marimo (Python). Both run in
the same sandboxed frame as HTML Apps ([live-blocks.md](live-blocks.md#the-sandbox)),
take the page's theme across the frame boundary, and hand the next turn a
typed selection. The code is in `src/lib/notebooks/`,
`src/lib/blocks/sandbox/notebook.ts` and
`src/components/artifacts/notebook-artifact.tsx`.

Observable supplies reactive execution and D3 supplies the drawing; D3 is not
a notebook runtime. marimo in the browser runs on Pyodide, so it has no CUDA
and no true CPU parallelism. A run that needs a GPU or a native host shows
the outputs a real run recorded, and says so.

## The forms

Theorem publishes a notebook as an App document and stores one artifact part
per revision. The part keeps the App part's payload fields (`documentId`,
`revision {position, contentDigest}`, `title`, `content`, `language`) and adds
the publication's own fields beside them, with `formVersion` (1 today). This
follows theorem-surface-contracts' artifact publication contract.

| form | `artifactKind` | `rendererId` | adds | `content` / `language` |
| --- | --- | --- | --- | --- |
| Observable | `observable` | `theorem-observable` | `form, cells [{id, kind: js\|md, source}], data?` | canonical JSON / `json` |
| marimo | `marimo` | `theorem-marimo` | `form, source, runtime, needs?, retainedOutputs {sourceRevision, href}` | source / `python` |

```
RetainedOutputs = { revision: "sha256:<hex of the source>", inputs,
                    cells: [{ id, outputs: [{ mime, data }] }],
                    execution: { host, device?, startedAtMs, finishedAtMs } }
```

- `src/lib/notebooks/forms.ts` parses the forms. It does not read a
  `formVersion` above the one it knows. Such a part still reaches its
  renderer, which says which version it is in.
- A stored marimo part carries no outputs. It names them by
  `retainedOutputs.href`.
- The UI contributes `theorem.notebook.observable` and
  `theorem.notebook.marimo` (`artifact-registry.tsx`). They claim a part by its
  form, and by the contract's kind.

## The artifact host

`src/lib/theorem/artifact-host.ts` reads two routes:

- **`GET /api/artifacts/v1/host`**: the host description.
  - `availability.marimo.execute` says where marimo runs: `browser` (Pyodide)
    unless an execution host is registered, then `native` or `native-gpu`.
  - `interactions.marimo` labels what the notebook offers: `view` "View
    result", `kernel` "Run notebook", and with a native host `live-session`
    "Run on host".
  - A Theorem that predates the route offers the browser run alone.
- **`retainedOutputs.href`**: the run of the source this part pinned. With
  none, the renderer reads the document's latest run, and shows it as a run
  of a different version of the notebook.

`theoremJson` sends these routes as absolute URLs. The SDK's passthrough
joins a relative path onto its base as path segments, which percent-encodes
a query's `?` into the path.

## Observable

- **Compiling.** The page compiles each cell with Notebook Kit's `transpile`
  (2.7.1). A cell that does not parse shows its error where it stands; the
  others run.
- **Running.** In the frame, Notebook Kit's runtime defines the cells into
  one `.cell` element each (`data-cell-id`). Cells run reactively, as
  Observable runs them.
- **Network.** The frame's policy allows no network. A cell's
  `import("d3")` resolves to the bundled module of the same name. Anything
  outside the import map is a rejected import that names the specifier.
- **Builtins.** On top of Notebook Kit's standard library, cells read:
  - `data`: the form's `data`;
  - `theme`: the page's theme as a reactive value, with `ink`, `line`, six
    `series` colours, `states` and fonts. Cells that read it run again
    when the person changes theme.
- **Export.** Copy and Download give the notebook as a Notebook Kit file,
  with its data as the first cell, so Observable Desktop opens it.

## marimo

- **App view.**
  - Outputs show and code is hidden. Source is a secondary action that shows
    the `.py` file.
  - The cells are split from the file's syntax tree (`@lezer/python`), the
    way marimo loads them.
- **Recorded outputs.**
  - The frame shows the recorded run once the outputs route answers. It runs
    no Python and reaches no network.
  - The status line names the host and device that recorded them, and the
    date.
  - A notebook that needs a GPU or a native host says whether one is
    connected. A GPU host is connected only when the host description says
    `execute: "native-gpu"`. With none, it says "Running it again needs a GPU
    host; none is connected", and with no outputs, that it is awaiting that
    host. Nothing pretends to run.
  - "Run on host" (`live-session`) is not drawn. Theorem has no route yet
    that starts a run on a registered host.
- **Run notebook.** For a `pyodide` notebook, the host's `kernel` offer swaps in a frame running
  marimo's islands runtime (0.23.16, from jsDelivr). The status line then says
  "Running in this page on Pyodide: no CUDA, and no true CPU parallelism."
  - **Recorded outputs stay in view.** They are written into each island's
    markup, so they paint before islands loads, and stay until a cell runs
    again.
  - **Network.** The frame reaches `BROWSER_RUN_HOSTS` and nothing else:
    - `cdn.jsdelivr.net`: islands and Pyodide;
    - `wasm.marimo.app`: the Pyodide lock file marimo publishes for its
      version;
    - `pypi.org` and `files.pythonhosted.org`: marimo's wheel and
      `needs.packages`.
- **Plotting defaults.** A hidden first cell sets them from the theme:
  - matplotlib `rcParams`, through `MATPLOTLIBRC`;
  - an Altair theme, only when the notebook imports Altair;
  - a Plotly template, only when it imports Plotly.
- **Controls.** marimo's controls render in shadow roots. islands copies
  only marimo's sheets, and those titled `marimo…`, into them. The frame's
  `marimo-theorem` sheet maps marimo's colour variables to the page's tokens
  and lets the colour scheme follow the page. Unlayered, it wins over
  marimo's layered defaults.
- **Worker shim.** Chromium refuses a module worker started from a `blob:`
  URL in an opaque-origin document, and islands always starts Pyodide's
  worker that way. `moduleWorkerShim` runs first and starts it as a classic
  worker that imports the same module. islands has no hook for its worker.

### Recording outputs

`scripts/marimo-retained-outputs.ts` runs a notebook with
`marimo export session` and writes the run as `RetainedOutputs`:

```
UV_PYTHON=3.12 bun scripts/marimo-retained-outputs.ts <notebook.py> <out.json> \
  --host "<machine, OS>" [--device "<device>"] [-- <notebook args>]
```

- It uses the notebook's own PEP 723 dependencies, in an isolated `uv`
  environment.
- `revision` is `sha256:` and the hex SHA-256 of the source, as Theorem
  computes it. The outputs name the file they came from, and Theorem
  records them only for the document's current source.

A GPU notebook needs a machine with CUDA to record its outputs.

## Theme

The page resolves its tokens (`resolvedTheme`) and hands them to the frame:

- in the first document, so the first paint is already in theme;
- on each change, as `theme.changed`.

The frame sets them on its root, along with `color-scheme` and the `dark`
class. Nothing in a notebook frame names a colour; the notebook surface CSS
is `notebook-frame.css`. The artifact's wrapper carries one class hook,
`notebook-surface`, for paper material.

## References

Selecting text, or clicking a cell, a plotted point or an entity, gives a
typed selection, as for HTML Apps:

- `cellId`: the nearest `[data-cell-id]`;
- `entityId` and `entityLabel`: the nearest `[data-entity-id]`.

"Ask about selection" adds a reference to the composer (`notebookReference`).
It points at the App document's revision, as an App's selection does:
`{resource: {kind: "graph-object", objectId: documentId, objectType:
"theorem.app"}, revision: String(position)}`, with the selection as its
excerpt.

- Theorem derives an `entity` locator from `entityId`, and a `table_rows`
  locator from `rowId`.
- A bare cell gets an explicit `{kind: "notebook_cell", cellId}` locator, but
  only for a cell the revision is known to have. Theorem resolves an explicit
  locator strictly and refuses the turn over one that names nothing. The
  known cells are an Observable notebook's cells, and a marimo notebook's
  cells in the recorded run of this source.

A plot marks its points with `data-entity-id`. The recorded matplotlib plots
do this with an invisible marker per point, whose `gid` names the entity,
drawn above the error bars.

## Stories

| Story | Shows |
| --- | --- |
| `/story/cpu-gpu-tradeoff` | View 1: the illustrative CPU or GPU model in Observable and D3 |
| `/story/cpu-gpu-measured` | View 2: CPU-only timings from a recorded run, labelled as such |
| `/story/cpu-gpu-awaiting-gpu` | View 2 as a GPU host would run it, awaiting one |
| `/story/cpu-gpu-model` | The cost model in marimo: recorded, and runnable in the browser |

The fixtures are in `src/stories/fixtures/`. Each story renders the part
Theorem stores (`notebook-parts.ts`), over a fake Theorem with no execution
host registered, which answers the outputs route from the committed runs.
The timings notebook is
`cpu-gpu-timings.py`. It uses PyTorch:

- the same work on CPU and on CUDA, with a check that the results agree;
- warm-up and synchronization;
- CUDA events for compute-only time, and wall time end to end;
- the device, dtype, repetitions and spread.

`cpu-gpu-timings.cpu-run.json` is a real CPU-only run, and says so. The
awaiting document has no runs, because no CUDA host has run it yet.

## What a native GPU host needs

- **Registration.** It registers with `PUT /api/artifacts/v1/hosts/{hostId}`,
  for marimo, with `native-gpu` and its device. The registration expires
  within ten minutes and is renewed.
- **Recording.** It runs the current source with `marimo export session` on
  CUDA, as `scripts/marimo-retained-outputs.ts` does on a CPU. It then puts
  the run as `RetainedOutputs` to `.../documents/{documentId}/outputs`, under
  its host id and device.
- **Starting a run.** Theorem needs a route that starts a run on a registered
  host. Until it has one, the renderer draws no "Run on host".

