# Artifact surfaces, notebooks and immersive artifacts

Status: planned 2026-11-08, nothing implemented. Written as a handoff: a new
session should be able to do this from this file alone, plus the files it
points to. Checklist: `artifact-surfaces-and-notebooks.checklist.json`.

Builds on SPEC-THEOREM-ARTIFACT-RUNTIME-1.0 (`~/Downloads/SPEC-THEOREM-ARTIFACT-RUNTIME-1.0.md`;
its gap ledger is `docs/plans/artifact-runtime.md`). This plan covers the
spec's Phase 3 notebook and scene providers, plus the owner's direction on
utility presentation, artifact presentation and material from 2026-11-08.

## 0. Read this first: the current artifacts are not good enough

The HTML App path works end to end. Theorem-UI#44 is merged; Theorem#978 is
open. Its nine-step CPU vs GPU release gate passed. **A gate pass is not design
acceptance.** The owner looked at the result and rejected how it looks and how
it is presented. Do not use the existing CPU vs GPU App as a reference for
quality. Do not tune it; replace the path that produced it.

What is wrong, concretely:

- **Coloration.** Every App invents its own palette.
  `rustyredcore_THG/crates/rustyred-thg-server/src/theorem_agent_stream/conversation_work/builder_app.md`
  (Theorem repo) gives the builder one accent colour and two backgrounds, then
  says "adapt its visual design to the task". The CPU vs GPU App gave every
  warp its own saturated colour, though no lesson needed warps told apart. A
  stronger model would still be inventing a palette; the contract allows it.
  Fix the contract (section 5, W3), not the model.
- **Usefulness.** The App showed that a GPU has more lanes. It did not answer
  the useful question: when is moving this workload to a GPU worth it?
- **Chrome repeats the object.** A conversational lead-in, the outer card
  title row, a large icon, the "App" label, and the App's own `<h1>` all
  introduce the same thing.
- **Generic "Interact" mode.** The inline preview is inert. A toggle swaps in
  a different, live renderer.
- **Width.** The artifact inherits the prose measure (`max-w-md` when not
  wide, inside `--thread-max-width`), so labels and controls are cramped. The
  composer covers its bottom edge.
- **Utilities look like results.** Status lines, disclosure controls, review
  launchers and finished artifacts are all long full-width bars of nearly the
  same shape.
- **Left-edge rails.** Coloured stripes on the left edge are out of this
  direction. Selection is a quiet background change. Keyboard focus is a
  complete outline.

Evidence, if the local e2e stack is running: thread
`http://localhost:3112/c/chatthread_sha256%3A303a2cda3c781609ef29b8812`
(data dir `~/.theorem/e2e-artifact-runtime-2`, server binary
`~/.theorem/e2e/bin/rustyred-thg-server-artifact-runtime`). It may not survive.
The description above is the record.

## 1. Direction

### 1.1 Each utility gets the form its job needs

Do not invent one new universal container. Some of these barely need a
container at all.

| What the element does | Presentation |
|---|---|
| Reports that Theorem is working | A short, unboxed activity line beside the speaker's name: `Theorem · Checking the examples…` |
| Exposes finished work or tool details | A small elapsed-time control: `Theorem · 42s · Details`. It opens a compact disclosure listing the actual activities |
| Asks the person to choose | The candidates themselves, each with its own selection control |
| Presents an artifact | The artifact itself, directly in the message |
| Requires a consequential decision | A concise question, with its controls directly below it |

- Status takes very little space. A decision gets enough space to be
  understood. A result gets the space it needs to be used.
- The expanded activity disclosure may have shape and material, because it
  holds something to inspect. The resting line has no full-width border, no
  card background and no block of its own.
- Failure and approval states must stay visible when the activity is
  collapsed. Removing decoration must not hide whether the work succeeded.
- **Today there are two overlapping presentations.**
  - `RunSummary` in `src/components/chat/theorem-parts.tsx` (around line 456)
    says "Done in N steps".
  - `WorkGroup` in `src/components/assistant-ui/elements/thread.aui.tsx`
    (around line 608) puts "Worked for…" inside a full-width bordered
    rectangle.
  - `RunningIndicator` (same file as RunSummary, around line 422) is the live
    line.
  - Consolidate them into one annotation.
- **Choices.**
  - Keep the review object: `src/lib/theorem/reviews.ts`, `src/lib/theorem/delegations.ts`.
  - Replace what appears in the conversation. Today `ReviewCard` in
    `src/components/review/review-card.tsx` is a full-width launcher button
    with a title, option count and status, and it opens a separate comparison
    pane. "App gallery" is only a review title, not a gallery renderer.
  - In the message, show each candidate substantially: side by side when
    wide, stacked when narrow, each with a caption and a selection control
    beneath it.
  - The comparison pane stays as the roomy view. It must not be the only
    place the work is visible.
- **Other utility-like outputs.** Appearance follows content. A search result
  looks like a result. A file shows a useful preview. A decision shows the
  thing being decided.

### 1.2 The artifact occupies the message

- **Remove**, for a self-identifying interactive artifact:
  - the permanent outer title row;
  - the large icon;
  - the kind label ("App");
  - the generic Interact toggle.

  All of it lives in `ArtifactMessageCard`, in
  `src/components/artifacts/artifact-message.tsx`.
- **Keep the title in the data model.** It serves search, history, saved
  items, the accessible name, and opening elsewhere. It is just not printed
  twice above the same visualization. The artifact carries a heading only when
  the heading explains its content. The builder prompt must stop asking for
  an `<h1>`.
- **Quiet controls.** Expansion and other actions go in one consistent
  corner, reachable by keyboard and touch. They become clearer on hover or
  focus, but are never available only on hover.
- **Revision state.** It becomes prominent when it matters, for example while
  exploring an older saved revision. The current "v1 of 2" panel behaviour in
  `app-revision-frame.tsx` and `artifact-panel.tsx` stays.
- **Interact needs a behaviour change, not just a hidden button.** The preview
  is deliberately inert (`PinnedAppFrame interactive={false}` inside `inert`
  in `src/components/artifacts/app-revision-frame.tsx`), and the interactive
  route can mount a different session. The new behaviour:
  - Local sliders, tabs, selections and pause controls work directly in the
    message.
  - A click reaches the control under it; no invisible activation step eats
    it.
  - Expensive computation has a meaningful control, such as "Run experiment".
    This is the boundary AR-I8 asks for.
  - Network access, workspace changes and other capabilities keep their
    permission boundaries. A passive preview reaches no network: see the
    `{ net: [] }` rule in `usePage`, Theorem-UI 4e266e6.
  - Previously computed output stays visible while an execution environment
    starts.
- **Width.** Prose and interactive content get separate width decisions.
  Paragraphs keep a readable measure. An artifact may use a broader region
  wide enough for labels, controls and a shared timeline. Make the composer's
  reserved space explicit, so the bottom of an artifact never sits beneath it.

### 1.3 Material: paper first, glass for small floating controls

The theme is Stone: quiet mineral colours, matte, low contrast between large
surfaces. This is a direction from the owner's notes, not yet a settled
decision; see section 6.

- **Paper** for the composer and content surfaces.
  - Source: `PaperTexture` from `@paper-design/shaders-react`. The current
    version is 0.0.82, pre-1.0, so pin it exactly.
  - Settings: fine grain and a little fiber. Folds, crumples and strong
    distortion stay effectively off.
  - The surface is slightly lighter or darker than its surroundings, with a
    restrained edge and a soft shadow. Text and controls stay crisp above the
    decorative layer.
  - Its mount uses WebGL2. For repeated static surfaces, render the texture
    once (cached or prerendered) instead of one graphics context per message.
    The shader is the authoring tool for the texture.
- **Glass** only for small floating controls and overlays.
  - Source: `glisse` 0.5.0 (React components plus a `Glass` surface, CSS
    backdrop effects with SVG refraction). Live-backdrop refraction is
    Chromium-only; other browsers keep the frost and the lit rim.
  - The strongest optical effect stays near the perimeter. Typing areas stay
    stable and legible over the Life backdrop
    (`src/components/life/life-backdrop.tsx`).
  - Use glisse for its material only. Keep Theorem's typography, icons,
    spacing and interaction conventions, not glisse's control appearance.
- **One material, varied prominence.** Shared typography, corner treatment,
  edge lighting, shadow and tint connect the forms in 1.1. They do not share
  one silhouette. The composer gets the strongest treatment; utility surfaces
  share its tint and edge at lower intensity.
- Settle the structure in 1.1 and 1.2 before fine-tuning shaders.

## 2. Artifact forms and their jobs

Keep several ways to produce an artifact. They are complementary, and one
artifact may combine them: Python computes the data, and a Theorem plot
component draws it.

| Form | Job | Runtime |
|---|---|---|
| **Theorem components through OpenUI** (default) | Comparisons, explanations, tables, forms, parameter controls, common interactive compositions | Rendered natively in the message from OpenUI Lang; no iframe |
| **Observable notebook** with D3 and Plot | Reactive JavaScript explanations and custom data visualizations | notebook-kit runtime in the block sandbox |
| **marimo notebook** | Reproducible Python experiments and scientific analysis | Pinned output from a server export; live session in a browser or native profile (section 6) |
| **Immersive** (luma.gl cells) | Spatial explanations; subjects where motion or many graphical elements help | SceneOS `scene-behavior-v1` packages on scene-os-web's luma.gl cell renderer |
| **Custom HTML App** (today's path) | Bespoke interactions beyond the component catalogue | Block sandbox, as now, but under the presentation contract (W3) |

D3 supplies visualization tools; it is not a notebook runtime. Observable
supplies reactive execution.

Immersive artifacts are opt-in, not the default. The owner expects them to
look very good, but not to suit everything.

## 3. Model-facing contract

The owner's emphasis: **the schemas must be well described so the model can
call them easily.** Extend the existing contract (`ArtifactContribution`,
renderer availability, `NotebookCell` locators, caption policy, theme-following
metadata). Do not build a parallel artifact system.

1. **Typed publication format.**
   - Today `complete_work` accepts `app = {title, html}`
     (`agent/src/operations/work.rs`, `AppDraft`).
   - Replace it with a versioned, discriminated draft:
     - `form: "openui_view"` with `{title, program}`;
     - `form: "observable_notebook"` with `{title, notebook}` (notebook-kit HTML);
     - `form: "marimo_notebook"` with `{title, source}` (a `.py` file with a PEP 723 header);
     - `form: "scene_behavior"` with `{title, package}` (scene-behavior-v1);
     - `form: "html_app"` with `{title, html}`.
   - Each form's source and runtime requirements live in the schema, not
     inside an HTML string.
   - Old stored reports with `app` must still read.
2. **Availability comes from the host.**
   - The model learns which renderers, libraries and execution environments
     actually exist before it chooses a form.
   - "Can produce marimo source", "can render saved marimo output" and "can
     execute on a GPU host" are three different capabilities.
   - Project them into the `start_work` description and the builder prompt
     from the real mount table and server configuration, never from a static
     list.
3. **Descriptions say when to use each form.** Per form:
   - intended uses, and when not to use it;
   - a minimal valid example;
   - required source and environment fields;
   - available inputs and actions;
   - limits and fallback;
   - validation errors that tell the model how to repair its output.

   Reuse the Index pattern, where library definitions generate the
   instructions, the supported names and a versioned library record:
   `src/components/index/library.tsx`, `validate.ts`, `view-renderer.tsx`.
   Then schema, prompt and renderer cannot drift apart. Schema `.describe()`
   text is what the model reads.
4. **Presentation is owned by Theorem.**
   - The host decides title treatment, available width, material, typography,
     semantic palette and plot styling, including theme changes across the
     iframe or execution boundary.
   - The model chooses a meaningful visual encoding (which series is which
     subject), never surface styling.
   - The contract separates three things: an interactive local view, starting
     a kernel or live session, and making a persistent change. That
     separation is what lets the Interact button disappear cleanly.
5. **Retained outputs and precise references.**
   - A notebook artifact keeps its source revision, relevant inputs, outputs
     and execution information.
   - Selecting a cell, a plotted point or an entity lets the person ask about
     exactly that thing later, through the existing `contextReferences` path
     (`src/lib/theorem/app-references.ts`) and `NotebookCell` locators.
   - It also gives the agent a concrete target for "change this assumption".

## 4. Current state (verified by source inspection, 2026-11-08)

### Theorem-UI `origin/main`

| Capability | State |
|---|---|
| HTML Apps | Implemented: pinned revisions, preview, interactive view, history, typed selection (`src/components/artifacts/*`) |
| shadcn | Configured: `components.json` style `base-nova`, base colour `stone`, CSS variables, lucide icons |
| OpenUI | `@openuidev/react-lang` 1.0.1 (latest 1.1.0), used only by the Index. No artifact contribution |
| Observable | `@observablehq/notebook-kit` 2.7.1 and `@observablehq/runtime` 6.0.1, used for reactive document cells (`src/lib/blocks/compile.ts`, `runtime.ts`). Nothing reads notebook-kit HTML; no notebook artifact renderer |
| D3 | Only `d3-array` and `d3-dsv`. The sandbox import map (`src/lib/blocks/vendor/manifest.ts`, generated by `scripts/vendor-block-modules.ts`) exposes only react, react-dom, json-rpc-2.0 and object-inspect. **Installing a package in the host does not make it importable in generated code**; it must be vendored into that map |
| marimo | Absent. Only a test fixture shows the missing-renderer fallback (`artifact-registry.test.tsx`) |
| Contributions | `UI_CONTRIBUTIONS` in `src/components/artifacts/artifact-registry.tsx`; renderers mounted in `artifact-renderers.tsx`. Rust ships none |

### Theorem `origin/main` and PR #978 (`rustyredcore_THG/crates/`)

- **Starting work.** The front starts work with `start_work`; `steer_work`
  only redirects existing work.
  - `WorkKind { Research, Builder, Verification, Computation }`, in
    `agent/src/operations/work.rs`. There is no "app" kind.
  - The builder prompt is included only in `worker_prompt`
    (`rustyred-thg-server/src/theorem_agent_stream/conversation_work/execution.rs`).
- **Publication.** `conversation_apps.rs` writes a `theorem.app` document
  under `chat-app:{work_id}`, with an Artifact receipt holding `AppTarget`.
- **The coupling to break first.**
  - Every Artifact receipt is parsed as an `AppTarget` and read as
    `theorem.app`: `delivery.rs` `publication_inputs` and `artifact_parts`,
    `projection.rs` `read_content`, and steering in `conversation_work.rs`.
  - `rendererId: "theorem-app"` is a literal in `delivery.rs`
    `artifact_parts`.
  - `projection.rs` hard-codes the change path `index.html`.
- **Notebook pieces that already exist.**
  - `LocatorKind::NotebookCell` (`theorem-surface-contracts/src/artifact.rs`);
  - `Locator::NotebookCell` (`theorem-space/src/agent.rs`);
  - `ContentPreview::Notebook`, tested with `application/vnd.marimo.notebook`
    (`theorem-space/src/catalog.rs`);
  - notebook cell provenance (`theorem-provenance/src/notebook.rs`).
- **marimo.** No process code exists. `docs/plans/post-core-feature-portfolio/OSS-REUSE.md`
  pins marimo 0.23.16 as a SELECT-only pgwire client. The current version is
  0.25.2. ARD P4 (`docs/ARD-THEOREM-2026-08-04.md`) says integrate over the
  network against versioned wire contracts, never by vendoring.
- **Immersive renderer.** `form-scene/scene/scene-os-web/web/src/explain/`:
  - `cells/luma.ts` is a WebGL2 instanced-quad cell renderer on luma.gl 9.4.2
    (core, engine, shadertools, webgl), with GPU picking through a pick
    framebuffer and frame backpressure. Its uniforms use the luma 9 path that
    carries over to WebGPU.
  - `contract.ts` mirrors `scene-behavior-v1`, owned by
    `scene-contract/src/behavior.rs`. A package is declarative: components,
    ports, connections, state, inputs, operations, checks, presentation
    steps. `rejectExecutableOrRemote` refuses code and remote references, and
    the browser validates before it runs anything.
  - The only built-in model is RV32I, a RISC-V CPU (`explain/model/rv32i.ts`).
  - Active on main; the last commits are dated 2026-11-08.
- **Adding a kind.** The ordered list of touch points is in the W5 notes
  below.

## 5. Workstreams

Order:
- **First slice (UI only, no backend needed):** W1, W2 and W3.
- **Then** W4.
- **Backend:** W5 before W6, W7 and W8.
- **Last:** W9, the CPU/GPU acceptance experiment, which proves the notebook
  work. W10 (material) can run beside W1 and W2 once their structure is
  settled.

### W1. Utility presentation (UI)

1. Write a failing test first (the `run-summary.test.tsx` style): one
   finished run renders a single annotation, "Theorem · 42s · Details",
   beside the speaker name. There is no bordered block, and it opens a
   disclosure listing the activities.
2. Consolidate `RunningIndicator`, `RunSummary` and `WorkGroup` into one
   annotation component. Failure and approval states stay visible while
   collapsed.
3. Choices: render a review's candidates inline (side by side when wide,
   stacked when narrow), each with a caption and a selection control wired to
   the existing review draft and submit hooks (`useReviewDraft`,
   `useSubmitReview`). The comparison pane stays reachable.
4. Consequential decisions: a concise question with its controls directly
   below.
5. Remove the left-edge rails: `border-s-2` at `src/components/chat/theorem-parts.tsx:674`
   and the markdown blockquote at
   `src/components/assistant-ui/elements/markdown-text.tsx:177`; confirm the
   blockquote with the owner (section 6). Selection is a background tint;
   focus is a complete outline. Today the artifact card's selected state uses
   `bg-selected` plus an outline; make it background only.

Done when no status or disclosure element renders as a full-width bar, and
the tests pass.

### W2. Artifact host (UI)

1. **Chromeless message artifact.**
   - Delete the title row, icon, kind label and Interact toggle from
     `ArtifactMessageCard`.
   - Keep the title as the accessible name: the preview already has
     `role="img"` and `aria-label`; the live view needs an equivalent.
   - Put quiet corner controls (Open, Copy, Download, version) in one corner,
     visible on hover and on focus, and keyboard and touch reachable.
2. **Direct interaction.**
   - The in-message artifact runs its local session directly; drop the
     inert/interactive toggle for local-only Apps.
   - An App that declares expensive or effectful capabilities shows its
     pinned output plus an explicit control ("Run experiment" or similar)
     that starts the session.
   - Keep the `{ net: [] }` rule until the person starts a session that
     declares network hosts.
   - Off-screen previews keep the poster behaviour (`useOnScreen`,
     `useSnapshot`).
3. **Width.** Give artifacts their own width token, wider than
   `--spacing-reading`, and keep prose at the reading measure. Reserve the
   composer's height explicitly in the thread layout
   (`thread.aui.tsx --thread-max-width` and the composer region).
4. **Tests.** The artifact card renders no "App" text, no "Interact" button
   and no duplicate title. A slider in the inline App responds to one click.
   The bottom of a tall artifact is not covered by the composer.

### W3. Presentation contract and palette (Theorem and UI). This fixes the coloration

1. Define a semantic palette in the UI tokens (`src/styles.css`, Stone):
   - surface, ink, muted, accent;
   - two to three subject colours for comparisons;
   - a small categorical ramp for charts;
   - a sequential ramp;
   - state colours (warning, error, success).

   Each needs light and dark values and accessible contrast. Validate the
   categorical ramp (the `dataviz` and `color-expert` skills have
   validators).
2. Send those tokens into every sandboxed frame through the existing bridge,
   as CSS custom properties that update on theme change. Generated code reads
   variables; it never picks hex values.
3. Plot defaults, one source for every renderer:
   - a Theorem Observable Plot defaults module;
   - a matplotlib style and an Altair/Vega theme for marimo (marimo does not
     restyle most plotting libraries to match its theme, so without this the
     colour problem returns inside notebooks);
   - the OpenUI chart component.
4. Rewrite `builder_app.md`:
   - drop "adapt its visual design to the task" and the `<h1>`;
   - require the injected tokens;
   - colour only meaningful states or subjects, letting labels do the rest;
   - expose assumptions and label illustrative timing as illustrative;
   - include one good example and one bad example, with the reason.

   This is the HTML App's share of contract item 4.
5. Done when two builds of different subjects share one palette, and
   switching the theme recolours a live App without a reload.

### W4. Theorem artifact component library through OpenUI (UI, then Theorem)

1. Build a Theorem artifact library, following OpenUI's official shadcn
   example: OpenUI Lang for structure, our shadcn primitives for rendering.
   - Pick the root structure; do not inherit the example's outer card.
   - Upgrade `@openuidev/react-lang` to 1.1.0 if its changelog is clean.
   - Check `@openuidev/assistant-ui` 0.2.0. It renders OpenUI Lang inside
     assistant-ui and needs `@assistant-ui/react` ^0.15 (we have 0.15.30),
     `ai` ^6 or ^7, and zustand ^4.5.5 (we have ^5: verify). Prefer it to a
     hand-rolled part renderer if it fits.
   - `@openuidev/react-ui` 0.18.5 has ready libraries. Borrow only what fits
     Theorem's look.
2. **Schemas carry no styling props.** OpenUI does not stop a model from
   choosing colours by itself; the schema does, by omitting them. Props are
   semantic:
   - subjects compared;
   - values and units;
   - parameter ranges and initial values;
   - which series is which subject;
   - the current step;
   - warnings and annotations.

   Implementations own type, spacing, material, controls and palette.
3. **Components above buttons and cards.** These roles are proposed, none
   built yet:
   - a comparison with aligned measures;
   - a timeline on a shared scale (stages: setup, transfer, compute);
   - a parameter-controlled experiment;
   - a plot with a legend and inspectable values;
   - a step-through sequence;
   - a table linked to a selected chart region.

   Draw charts with Observable Plot, the same library as in notebooks, so one
   palette module serves both.
4. **The library record drives the prompt.** It generates the builder
   instructions and the supported names, and carries a version. Theorem's
   `openui_view` form (W5) validates against that versioned record and
   returns repair-oriented errors.
5. Register an `openui.view` contribution that renders natively, with no
   iframe, and selection that produces entity references.

### W5. Backend: typed artifact publication (Theorem; hand to Codex)

The Rust work goes to Codex through codex-bridge (memory: Codex for backend
work); this session builds the UI against the contract. Codex cannot run
cargo, so run it here with
`CARGO_TARGET_DIR="/Volumes/SSD Samsung/cargo-target-organize"`.

1. **Generalize first.**
   - The artifact target and receipt carry the document kind.
   - `publication_inputs`, `artifact_parts`, `read_content` and steering
     dispatch on that kind.
   - The `rendererId` and path literals go.
   - Prove with the existing App tests unchanged: `delivery_app_tests.rs`,
     `capture_turn_tests.rs`, `settlement_tests.rs`, `conversation_apps.rs`
     tests, and `tests.rs` `steering_a_published_created_app_keeps_its_identity_and_current_user_state`.
2. **Replace `AppDraft` with the discriminated draft** from section 3,
   item 1. Keep `Builder` as the one work kind, with a `form` in
   `start_work`, unless a form needs a different role or tool set. Each new
   `WorkKind` touches these places:
   - `catalog_projection.rs`, `working_set.rs` and `turn_loop.rs` (node types);
   - the role, tools and node-type matches in `conversation_work.rs`;
   - prompt files;
   - capture validation and settlement;
   - delivery and projection;
   - `selected_front_model_is_inherited_by_every_worker_kind`.
3. **One publisher per form**, each writing its document kind through
   `DocumentProduct` with source guards like `conversation_apps.rs`: for
   example `theorem.openui-view`, `theorem.observable-notebook`,
   `theorem.marimo-notebook`, `theorem.scene-behavior`. Exact names are this
   workstream's call; record them in the module docs.
4. **Availability projection** (section 3, item 2) into the `start_work`
   description and the builder prompt. **Descriptions** (item 3) for each
   form, written for the model.
5. **Validation per form:**
   - OpenUI: the program against the library record;
   - Observable: `deserialize` round trip and cell modes allowed;
   - marimo: `marimo check --select MW` for the browser profile;
   - scene: `scene-contract` `validate`.

   Errors read as repair instructions.

### W6. Observable notebook artifact (UI)

1. Vendor `d3` 7.9.2 and `@observablehq/plot` 0.6.19 into the sandbox import
   map with `bun scripts/vendor-block-modules.ts`. The frames' CSP stays
   closed, and generated code imports `d3` and `@observablehq/plot`.
2. Read notebook-kit HTML with `deserialize` and run its cells with
   notebook-kit's own runtime (`define`, `display`, stdlib) in the block
   sandbox. Do not write a second runtime.
3. Allowed cell modes to start: js, md, html, tex, dot. Leave out sql,
   python and node until there is a reason for them.
4. Map cells to `NotebookCell` locators for selection.
5. Use the W3 tokens and Plot defaults.

### W7. marimo notebook artifact (Theorem server, UI)

1. **Install.**
   - Run marimo 0.25.2 through uv on Python 3.13:
     `uvx --python 3.13 marimo` works on this machine. System Python is 3.15,
     which marimo does not target yet.
   - Update the OSS-REUSE pin (now 0.23.16), THIRD_PARTY_NOTICES and the OSS
     manifest.
   - Add uv and the pinned marimo to the server image (Fly builds are slow;
     see the memory note on Theorem UI on Cloudflare).
2. **Canonical source.** A `.py` notebook with a PEP 723 `# /// script`
   dependency block, stored in theorem-doc-store. The output is a derived
   result, not the source (spec 7.2).
3. **Pinned output.** On publication the server runs `marimo check`, then
   `marimo export html` (one execution, under time and memory limits). It
   stores the HTML as a result reference on that revision. The preview shows
   this output and never starts compute (AR-I8). Show the app view with code
   hidden; source is a secondary action.
4. **Live session**, by profile (section 6):
   - **browser**: `marimo export html-wasm --mode run --execute`, run in the
     sandbox under Pyodide. It needs named network grants for Pyodide and the
     package CDN, and `allow-scripts` is enough. It has no CUDA and no true
     CPU parallelism.
   - **native**: a marimo process on an execution host, with explicit compute
     admission, a timeout and revoke.
5. **Theme.** Inject the W3 matplotlib style and Altair theme, plus CSS for
   the notebook surface.
6. **Acceptance.** AR-012: open a notebook, use a real widget, identify a
   cell, stop the host, and reopen the saved view.

### W8. Immersive artifacts: luma.gl cells (Theorem SceneOS, UI)

1. **Discovery first.** Read `form-scene/scene/CRATE.md`, `README.md` and
   `scene-os-web/web` to learn how scene-os-web is built and served. Decide
   the mount: a sandboxed frame serving the scene-os-web bundle, or importing
   its cell renderer as a package. Record the decision.
2. **The model emits a `scene-behavior-v1` package** through the
   `scene_behavior` form. It is declarative and validated by
   `scene-contract/src/behavior.rs`; the browser mirror refuses the same
   packages.
3. **Presentation.**
   - Immersive artifacts take the full artifact width.
   - The preview is a poster frame; the animation loop starts only on screen
     and on request.
   - Respect reduced motion.
   - Picks (`cells/pick.ts` regions) become entity references for "ask about
     this".
4. **Use it where it helps.** The RV32I model is a natural companion view for
   CPU execution in W9.

### W9. Acceptance: the CPU vs GPU experiment

Rebuild the example around one question: **when does moving this workload to
a GPU become worthwhile?**

1. **Explore the tradeoff.** An OpenUI composition, or an Observable notebook
   with D3 and Plot.
   - Three controls: workload size, computation per item, and whether the data
     is already on the GPU.
   - CPU and GPU completion on one time scale, with distinct setup, transfer
     and compute stages.
   - The explanation changes with the controls, so the person can find a case
     where the GPU helps, a case where overhead dominates, and why the
     crossover moves.
   - Colour distinguishes only the two subjects and meaningful states.
   - It is labelled illustrative and exposes its assumptions.
2. **Measure a real computation.** A marimo notebook.
   - Run a comparable operation on CPU and GPU, verify that the results
     agree, and plot timings across problem sizes.
   - Report device, data type, repetitions and variability, with
     compute-only and end-to-end timings shown separately.
   - GPU timing is asynchronous. Synchronize and warm up. On a CUDA host,
     use CuPy events. On this Apple Silicon Mac there is no CUDA: use PyTorch
     MPS with `torch.mps.synchronize()`, or MLX with `mx.eval`.
   - A real measurement needs the native profile. The browser profile can
     run the model and saved output, not a GPU benchmark.
   - A Python loop against vectorized NumPy is a fine experiment, but it must
     not be labelled CPU versus GPU.
3. **Optional immersive companion.** RV32I executing a kernel's inner loop.
4. **The pass bar is design, not only function.**
   - It answers a useful question, with restrained colours and direct
     interaction.
   - The computation is meaningful.
   - It feels like part of Theorem from the moment it appears: no duplicate
     title, no Interact, its own width.
   - Run it signed in on the local e2e stack (memory: local end-to-end stack;
     the identity provider at 127.0.0.1:8408 is local only). Show the owner
     screenshots before calling it done.

### W10. Material (UI)

Apply section 1.3 once W1 and W2 have settled the structure.
`@paper-design/shaders-react` and `glisse` are not installed yet. Go through
the sourcing gate (`implementation-sourcing-gate`) when adding them.

## 6. Decisions waiting on the owner

Ask one at a time, with the recommendation:

1. **marimo live profile.** Recommendation: build both profiles into the
   contract. Ship the browser profile (Pyodide) as the default live session;
   it needs no Python kernel service in production. Ship the native profile,
   on the Theorem host first, for measurements that need real hardware. The
   spec (section 7) asked for an external marimo process. The browser default
   is a proposed change, so confirm it.
2. **Paper versus glass for the composer.** Recommendation: paper (1.3).
   Glass stays for small floating controls.
3. **Blockquote rail.** Markdown blockquotes use a left border today.
   Recommendation: replace it with an indent and a background tint,
   consistent with "no left-edge rails".
4. **Draft shape.** Recommendation: one `Builder` kind with a typed `form`,
   not five new `WorkKind`s.

## 7. Working rules for the session

- Follow ub-mode. Write the failing test first and see it fail for the
  expected reason. Make the smallest change that passes it. Prefer upstream
  libraries over hand-rolling (the global "Don't hand-roll" rule; new `src/`
  files pass the sourcing gate).
- Every model call goes through Theorem and OpenRouter. No UI-side model
  workarounds; never Together. Load keys only with
  `set -a; . ~/.theorem/provider-keys.env`, and never print them.
- Use the commit format `<type>(<scope>): <description>`, in English. No
  `Co-Authored-By` lines and no emojis.
- UI checks:
  - `bun test src/components/artifacts src/lib/artifacts src/lib/blocks src/lib/theorem/app-references.test.ts`
    plus the tests for whatever else you touch;
  - `bunx tsc --noEmit -p .` (it can take over two minutes; run it in the
    background).
- Theorem PR #978 is open on `claude/artifact-runtime`. Branch new backend
  work from `main` once #978 merges, or from that branch if it has not.
- Leave other sessions' stacks alone (ports 3102, 8392, 8398).
