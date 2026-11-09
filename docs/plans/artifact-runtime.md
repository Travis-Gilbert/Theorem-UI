# Artifact runtime: Phase 0 gap ledger

Spec: SPEC-THEOREM-ARTIFACT-RUNTIME-1.0 (2026-11-07). Ledger taken 2026-11-07 against
Theorem UI `origin/main` 5c3af5b and Theorem `origin/main` e2d623e9c7.
Backend half of the first slice: `docs/plans/artifact-runtime/backend-slice.md` in the Theorem repo (branch `claude/artifact-runtime`).

## Source to UI sequence (generated App, today)

```
person: "make an interactive CPU vs GPU artifact"
  -> front role: start_work {kind:"builder"}                       (Theorem, conversation_work.rs)
  -> builder worker: complete_work.app {title, html}               (agent/operations/work.rs)
  -> settle: conversation_apps::publish                            (theorem.app DocumentProduct, revision {position, contentDigest})
  -> delivery::artifact_parts: stored part type "artifact"         (kind app, renderer theorem-app, payload.content = pinned HTML)
  -> SDK toAssistantMessages: data part "theorem-artifact"
  -> UI readArtifact -> ArtifactMessage (chat) / ArtifactPanel (dock)
  -> resolve(subject, distance, contributions, mounted)            (this change; was a rendererId switch)
  -> preview: sandboxed frame of the pinned revision               (this change; was a card that needed two clicks)
  -> workspace: DocumentApp, live state in the App document, revision-guarded saveSource
```

## Ledger

Status: **implemented** (observed in source and tests), **adapter** (exists, needs connecting), **absent**.

| Edge | Before | Owner | This slice |
|---|---|---|---|
| ArtifactContribution / resolve | Rust only, unused in production; UI chose by `rendererId` string with four `=== 'theorem-app'` branches (AR-I10) | theorem-surface-contracts | TS projection of `resolve` with the Rust tests ported; UI contributions + mount table; branches removed |
| Remaining kind switches | `fileNameFor` branched on kind for the extension; `kindLabel` and `ArtifactKindIcon` switch on kind | UI | the extension now follows the media type the contribution hands over (`sourceOf`); the label and icon are chrome, not renderer choice, and stay until contributions carry a glyph |
| Contribution manifest over HTTP | absent | Theorem modules | out of slice; the UI declares its built-in contributions in the same wire shape (`readContribution` parses it) |
| Builder App production | implemented (start_work builder -> complete_work.app -> doc store) | conversation_apps | starter kit `theorem-app-kit/1` added (B1, Codex); the release gate found settlement losing a CAS race to the 1 s lease heartbeat, so the App never published (fixed, B4, Codex) |
| App part pins revision | implemented (`payload.revision`, inline pinned HTML) | delivery.rs | UI now opens that pinned HTML for historical revisions |
| Inline preview (AR-009) | adapter: chat card, click to expand, then Run, latest revision only | UI | Preview renderer: sandboxed frame of the pinned revision, live only while on screen, snapshot poster off screen |
| Workspace open (AR-010) | implemented (dock panel, same artifact id, revision pin per artifact) | UI | unchanged; body chosen by resolve at Interactive |
| Historical revision (AR-002, step 8) | absent: panel switcher showed latest App with "Changed since this result" | UI | read-only frame of the pinned revision, labeled, with Open latest |
| Revision-guarded edit (AR-007) | implemented for Apps (UI saveSource, server AppTarget guard) | doc store | revise-from-conversation verified (B2, Codex) |
| Typed selection to next turn (step 6, AR-017) | implemented for text / rowId / field | UI sandbox bridge | `entityId` / `entityLabel` from `[data-entity-id]` |
| Sandbox isolation (AR-006, AR-011) | implemented: `sandbox="allow-scripts"` opaque origin, CSP meta `default-src 'none'`, bridge served to the frame's own window only | UI blocks | preview frames use the same sandbox; preview host grants no writes |
| Post-commit failure (step 10, AR-I6) | implemented in delivery (artifact parts appended even when synthesis fails) | delivery.rs | verified with tests (B3, Codex) |
| Text artifacts (create_artifact) | uncommitted Theorem worktree only, last-writer-wins | artifact_tools.rs (unmerged) | out of slice |
| Lazy payload / preview refs (§5.4) | absent | Theorem | out of slice; previews cached in the browser by revision + renderer build |
| Notebook (Observable, marimo) | absent | UI | implemented: `theorem.notebook.observable` and `theorem.notebook.marimo` contributions, claiming the publication contract's `observable` and `marimo` parts. The page compiles Observable cells, which run offline in the sandboxed frame with the vendored D3. marimo reads its recorded outputs from the part's `retainedOutputs.href` and its offers from `GET /api/artifacts/v1/host`; it runs on Pyodide in the browser on request. A GPU or native run waits on an execution host and a route to start a run on it. See `docs/blocks/notebooks.md` |
| SceneOS, image, chart providers | absent | their owners | Phase 3 |
| Promote to App | absent (Apps lifecycle exists separately) | theorem-apps | Phase 4 |
| Platinum / cross-surface parity | not inspected here | AGPUI host | Phase 5 |
