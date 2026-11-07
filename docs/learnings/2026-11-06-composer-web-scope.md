# Web scopes the turn to RustyRed web instead of asking in text

The Web toggle used to append "Search the web for this." to the message and leave the model to decide (see `2026-11-05-composer-search-submit.md`). The owner's direction is that Web should use RustyRed web directly. The toggle now sends no text: while it is on, each send, edit and regenerate carries the SDK turn option `capabilityScope: ["web_search", "web_read"]`, merged in `useTheoremThreadRuntime` beside the composer's context references and read at send time like the model pick. The chat server (`theorem_agent_stream.rs`, owner turn catalog) keeps only the named native operations plus the person's workspace tool, so the model can answer only from RustyRed web: `web_search` finds pages, `web_read` reads one.

When Web and Plan are both on, the runtime explicitly adds `draft_plan` to the web scope and sends `planning: true`. The model can research and write the requested plan in the same turn. Web alone still scopes only to `web_search` and `web_read`; Plan alone adds no web restriction. This makes the request self-contained rather than depending on the planning server retaining an unnamed tool.

Trade-off: a Web turn has no other tools (recall, documents, files), except `draft_plan` when Plan is also on. The SDK has no tool-choice option, so the scope makes web the only route, not a forced first call. The toggle stays on across sends until it is turned off, as before; there is no Tools menu, only the chip beside the attachment button.

The same change fixes a stray "Theorem tools" line above every composer. assistant-ui's `TriggerPopover` renders its children while closed so its behavior child can register; the vendored list parts return nothing when closed, but the heading added for "/" did not check `open`.

## Evidence

1. `runtime.test.ts`: a send through `TheoremRuntimeProvider` with Web on posts `capabilityScope: ["web_search", "web_read"]` and the typed text unchanged; with Web off it posts no scope. Removing the merge from the runtime makes the Web-on case fail.
2. `composer-tools.test.tsx`: the chip toggles `aria-pressed` and the turn option, stays on after a send, and leaves the message as typed. The heading test fails without the `open` check and passes with it.
3. Typecheck and scoped ESLint pass. The full suite has the same 12 failures as unchanged main (media panel, block listener, unsaved marker), none in changed code.

Not exercised against a signed-in deployment: the scope is verified from the SDK types and Theorem server source at `5664d6da`, not observed on the live chat API.

## Review follow-up: Web with Plan

- Located the reviewed code in UI PR #36 at `02760c9`; the deployed branch did not contain these toggles. Backend PR #957 already retains `draft_plan` during filtering, but the UI now explicitly names it as requested by the review. That server PR remains a deployment prerequisite.
- Extended the rendered runtime test to capture `planning` in the actual SDK POST and check all four Web/Plan combinations. Before the fix, only Web+Plan failed because its scope omitted `draft_plan`; the other three combinations passed.
- Added the existing `DRAFT_PLAN` constant to the newly allocated web scope only when both modes are enabled. Reused the current runtime composition and toggle owners; no library or alternate state mechanism is needed for this one condition.
- Both focused suites pass: 34 tests, 107 assertions. These use mocked HTTP responses; they do not prove a signed-in plan was written. Scoped ESLint reports no errors and one existing test-variable shadow warning.
- In an isolated source snapshot, crapper reports the existing runtime hook at CC14 / CRAP15.0 with 82.6 percent coverage; it remains above10, so no blanket complexity pass is claimed. Dryer finds no duplicate candidates at0.8. Mutator's selected `&&` to `||` change is killed by the request tests; no selected survivor remains. Existing unrelated uncovered paths were not presented as tested.
- Monty investigation: the backend already has `execute_program` backed by `InProcessMontySandbox` and a host namespace built from the permitted catalog. Native tool calls currently dispatch directly, and the calling prompt prefers them. Making programmatic execution an explicit model tool is separate architecture work; no backend execution, permissions, or model setting changed in this review fix.

- Typecheck initially found the checkout's stale generated terminal binding (`set_palette` missing). Rebuilt the gitignored bindings with the existing terminal build script and an SSD target directory; final `bun run typecheck` passes. No terminal source changed.
- Evidence is retained under `/Volumes/SSD Samsung/theorem-chat-search-evidence/web-plan-scope-review`. Removed the temporary metrics snapshot and preserved the checkout's pre-existing `.metrics` and `coverage` directories. This change updates PR #36; it does not merge or deploy its other features or the still-open backend dependency.
