# Model catalog default and failure feedback

The live settings page named Inkling even when the authority did not report a default. Missing catalog requests also claimed turns would run on a default that the page had not verified. The model picker and command palette discarded catalog errors.

## Actions and evidence

1. Inspected the existing model-list parser, settings, picker, command palette and native model resolver. Kept `GET /api/chat/v1/models` and the existing first-slash `provider/model` send contract. The backend catalog remains the owner of runnable choices.
2. Reproduced four failures before editing production code: safe `defaultError` was discarded; unknown default claimed Inkling; a configured model assumed mixture routing policy; invalid default had no visible cause.
3. Parsed only `defaultError.code` and `defaultError.message`; additional fields do not pass into the UI. Settings now names the actual reported model/ref or explicitly says no default was reported. Shared feedback covers settings, picker and palette; settings can retry a failed catalog request. Available explicit choices remain usable when the default is invalid.
4. Rendered the real settings route, picker and command palette under React Query and Router. Verified 404 → uncertainty and Retry → recovered catalog, plus actual picker/palette selection yielding the exact provider and slashful model ID for the next send.
5. Kept existing owners and components. Extracted only existing picker grouping/selection and parser row mapping to keep changed functions below CRAP 10. No dependency or credential flow changed.
6. Focused tests passed: 20 tests. Crapper reports changed functions at most 8; existing unrelated model-entry parsing/preferences complexity remains outside this fix. Dryer found only the existing untouched PluginsTab/SkillsTab pair, with no added duplication at 0.8.
7. Mutator exercised 13 targeted sites: 12 killed, one equivalent survivor (`record(raw) ?? {}` → `record(raw) || {}`). `record` returns either an object (truthy) or undefined, so the two expressions have identical outputs. Initial meaningful identity survivor was killed after adding direct multi-row helper coverage; rendered tests alone can bypass mutation overlays through TypeScript path aliases. No equivalent mutant is claimed killed.

8. Final integration passed: 381 tests / 1113 assertions across 58 files, typecheck exit 0, affected-file lint exit 0, and `TMPDIR=/Volumes/SSD Samsung/theorem-chat-search-tmp NITRO_PRESET=cloudflare_module bun --bun vite build` exit 0. Build reused unchanged previously verified terminal and IDE assets. Existing bundle-size/directive warnings remain; the colocated settings test is explicitly excluded by the router because it exports no Route.

Evidence: `/Volumes/SSD Samsung/theorem-chat-search-tmp/app-ui-evidence/model-default-*.log` and `model-picker-green.log`. Production acceptance and deployment are parent-owned; these tests do not establish a live selected-provider run.
