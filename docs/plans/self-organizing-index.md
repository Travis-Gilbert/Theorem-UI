# The self-organizing Index in Theorem UI

The Index is where Theorem keeps the material it has filed, and where it learns
how that material is used. It organizes the material, watches how it is worked
with, and improves the environment for working with it: not only where things
are filed, but the views they are found, compared and acted on in.

The backend half and the wire contract are in the Theorem repository,
`docs/plans/index-workspace/SPEC-INDEX-WORKSPACE-1.0.md`. This plan is the
frontend half. The checklist is `self-organizing-index.checklist.json`.

## Sources

- The Index handoff idea: precomputation rather than an inbox; filing with
  uncertainty and correction; a working pane that does more than preview.
- Theorem PR 845 (Personal Operations): saved scopes are queries, never copies;
  a custom view is a scope plus operations plus presentation, and changing the
  presentation never changes what an object is; learned behaviour changes only
  rankings, proposals or policies, inspectably.
- `NORTH-STAR-organizing-engine.md`: one engine emits candidate changes with
  confidence and an admission tier; high confidence applies, the rest is a
  stream to glance at, never a backlog.
- `SPEC-SOM-CELL-COLUMN-2.0.md`: the map is a view of the data, never the
  decider of membership; it is frozen per generation; it works without a model.
- OpenUI (`@openuidev/react-lang`): a component library the model composes
  against, declarative programs with reactive state and tool-backed queries, and
  a renderer that runs a stored program with no model in the loop.

## Shape

Index is a fourth mode on the rail, at `/index`.

- **Panel** (beside the rail): search, Everything, the collections, saved views
  (pinned first) and the views Theorem prepared, and the improvement policy.
- **Surface** (the dock's main panel): the active view, rendered from its
  durable definition by the OpenUI renderer, under a header with its title,
  purpose, revision history, pin and edit. Notices of prepared improvements sit
  above it.
- **Inspector** (beside the surface): the selected item, what it is, where it
  was filed and why, how confident the filing was, correction and undo, what it
  is used with, and Ask Theorem.

## Decisions

| Decision            | Choice                                                                                                                                       | Why                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Where views live    | In Theorem, as `IndexView` with revisions (`/api/index/v1/views`)                                                                            | A view must open directly, from any conversation and with any model; the artifact panel is derived from thread messages and cannot own it |
| Presentation        | OpenUI Lang programs over an Index component library in `src/components/index/library.tsx`                                                   | The model composes against the same catalogue a person uses; a stored program re-renders with no model                                    |
| Data in a view      | Named bindings the server executes (`POST /api/index/v1/query`), called from the renderer's `toolProvider`                                   | Bindings are structured, so the server can validate a candidate's coverage; filters and search run without the model                      |
| Default views       | Shipped as programs in code (`default:home`, `default:collection:<id>`, `default:atlas`)                                                     | The Index is useful before anything is learned; "Customize" copies a default into a stored user view                                      |
| Learning signal     | Observations recorded by the surface (`/observations`), separate from explicit preferences (`/preferences`)                                  | Observation, interpretation and adopted preference stay three different things                                                            |
| Improvement         | Theorem's background loop proposes; the UI shows proposals and applied changes with Accept, Dismiss and Revert                               | The work happens while nobody waits; nothing live changes under the person                                                                |
| Validation          | The server checks bindings and lints the program; the UI parses the candidate with the real library before showing it and reports the result | The parser is TypeScript; the server stays declarative                                                                                    |
| Library publication | The UI publishes `library.prompt()`, component and callable names to `/api/index/v1/library` when its digest changes                         | Theorem composes candidates against exactly the components this build renders                                                             |
| Atlas               | A library component over the `map` binding (`AtlasSnapshot` v2)                                                                              | The map is one optional way to see the material, never its identity                                                                       |
| Tests               | `bun test` over the pure modules: bindings, observation batching, default programs parsed by the real parser                                 | No new test runner                                                                                                                        |
