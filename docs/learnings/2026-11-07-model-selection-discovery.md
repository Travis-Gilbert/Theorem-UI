# Per-turn model selection and directory errors

The per-thread SDK adapter retained the options from whichever surface first
created it. A terminal turn could therefore keep later chat turns from sending
the selected model. Keep the adapter for message identity, and compose current
turn options into each run configuration instead. Explicit run-config options
retain their existing precedence; terminal execution mode does not leak into
chat, and a later default turn does not reuse the previous selected model.

The regression uses the real SDK with a fixture HTTP authority and checks the
serialized model/mode for terminal, selected chat, and default turns on one
thread. It failed before the fix and passes afterward. Current-main focused
runtime, model, picker and settings checks: 38 passed; typecheck passed after
building the terminal bindings. Cloudflare production build passed. Four targeted installed-mutator changes to
directory-error predicates were killed by the tests.

An explicitly unavailable OpenRouter catalog now explains why only configured
models are visible and supplies a Retry model list action. An absent field from
an older authority does not invent an outage. Backend discovery remains the
catalog owner; this UI does not fetch an independent roster or infer provider
health from a listing. No new dependency or custom transport was added.

The changes were transplanted onto current main independently of the concurrent
composer Plan/Effort branch. A Chromium check rendered the unavailable directory, used Retry to load a
recovered catalog, and starred the discovered model. The test used API fixtures;
it is not evidence of authenticated production behavior. Production Worker
version `7bd69e80-c974-4358-8d9a-04ebb502804a` deployed source `94ef709`.
Live authenticated model-switch and response checks remain separate gates.

## Follow-up: the Life field captured model-menu clicks

The person could star several models but could not select them in the composer.
The picker and composer worked without the Life background. With the actual
LifeBackdrop mounted, React propagated the portaled option's pointer event into
the drawing handler. Its DOM-ancestor selector classified the option as empty
field space, captured the pointer, and prevented the model click from selecting.

The field now requires DOM containment before treating a target as drawing space.
Portaled context-menu events also keep their normal propagation. This reuses the
existing event owner and the DOM `contains` primitive; no menu implementation or
dependency was added. Inline controls remain excluded and empty-space drawing
still captures the pointer.

Evidence on UI main base `d07332fc2c772b131db70518b86aa720bca62582`:

- The mounted regression failed before correction because the portaled option's
  pointer event was prevented; empty-space drawing already passed.
- After correction, 32 focused tests passed across Life mounting/input, model
  parsing, picker and Settings. Portaled pointer/context-menu events and normal
  drawing are covered separately.
- Real Chromium and WebKit browser runs starred DeepSeek and a second model in
  the actual Settings UI, selected DeepSeek in the composer with Life mounted,
  reloaded and retained that selection, then selected the second model. The
  Chromium run failed before the fix and both browser engines passed afterward.
  API fixtures supplied the catalog and an unavailable preferences endpoint;
  these checks do not prove authenticated production model execution.
- Browser logs, screenshots and the temporary reproduction route are preserved
  under `/Volumes/SSD Samsung/theorem-chat-search-evidence/model-selection-discovery`.
  The temporary route was removed from the app before production building.

Independent spec and standards reviews found an additional context-menu edge:
letting a portaled event pass the capture handler still allowed Base UI's
bubbling trigger to open the Life menu. A stronger regression failed on that
behavior. The trigger now uses Base UI's `preventBaseUIHandler()` in the bubble
phase for non-field events; child context handlers run and native defaults are
preserved. Both reviewers rechecked the correction with no remaining findings;
all 32 focused tests passed with 83 assertions. The test runtime also supplies
the SDK's typed message conversion so TypeScript does not infer `never`.

Final validation passed:

```sh
bun test src/components/life/life-backdrop.test.tsx src/components/life/mount-life.test.ts src/components/chat/model-picker.test.tsx src/lib/theorem/models.test.ts src/routes/settings/ai.test.tsx
bun run typecheck
bunx eslint src/components/life/life-backdrop.tsx src/components/life/life-backdrop.test.tsx
CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR='/Volumes/SSD Samsung/theorem-picker-terminal-target' TMPDIR='/Volumes/SSD Samsung/theorem-chat-search-tmp' bun run build:cloudflare
bunx wrangler deploy --config .output/server/wrangler.json
```

The complete release build rebuilt the terminal and IDE assets. UI code
`fc7d62b3b339b9adba4b4986083506e2706d51b7` is pushed to main and deployed as
Cloudflare Worker version `0640cc8b-65a6-481b-a14a-c3104a9c4933`. A fresh browser
request to theorem.rs returned HTTP 200 and loaded `sidebar-BEsR152R.js`, whose
SHA-256 exactly matches the locally built bundle containing the corrected Life
event handlers. The backend was not changed by this follow-up. Authenticated
production selection/model execution remains outside the automated check;
the reproduced interaction and its fix were exercised with API fixtures.

## Selected models remain Theorem; Web research is additive

The configured fallback is now labelled `Default model`, with the actual model
name shown as `Name (default)` in the composer once the authority reports it.
It no longer carries a special Theorem vendor identity or logo. Explicit model
choices keep their own names. Settings explains that every choice powers Theorem
and that provider labels identify the supplier; the static source is labelled
`Configured catalog`. The command palette uses the same default-model wording.
No mixture-of-models entry or composed routing was enabled by these labels.

The Web toggle now sends `webResearch: true`, independently of `planning: true`.
It does not write `capabilityScope`, so it no longer removes App, worker, or
other admitted operations. An explicit caller scope remains unchanged. The
native server owns admission and research instructions; this UI introduces no
parallel tool catalogue or transport. The tooltip describes this combined use.

The native SDK's send/edit/retry OpenAPI schemas, pinned Fern request types and
assistant-ui option type include the additive flag. Generated clients already
serialize all body fields, so no custom HTTP path or new runtime package was
needed. The UI retains its existing alpha3 tarball and runtime fixes, extending
the checked-in Bun patch with declaration changes. Applying the complete patch
to a clean tarball passed and preserved its background-send retry runtime.

Evidence retained in the existing external evidence directory:

- Five UI regressions failed before correction: the Web flag, Web plus Plan,
  default picker label, and Settings identity wording. The current focused suite
  passes 47 tests / 145 assertions, including actual SDK JSON serialization and
  preservation of an explicit capability scope. Typecheck passed; affected-file
  ESLint passed with two pre-existing shadow warnings in runtime files.
- The SDK's typed regression initially rejected `webResearch`. SDK typecheck and
  15 adapter tests pass after the contract update. HTTP fixtures verify research,
  planning, selected model and an explicit scope across send, retry and edit;
  the existing headless-session test also sends both additive flags.
- Pinned Fern generation succeeded. Full `sync:contracts` could not run because
  its ignored native `sdk-projection-components.json` prerequisite is absent.
  The exact three-property schema addition was applied to the pinned OpenAPI
  and is retained in `update-environment-contract.mjs` for future full sync.
  Unrelated generated Graph/IDE drift was removed rather than included.
- Coverage-backed Crapper scores the modified picker/Web/Settings functions
  below 10 (maximum 8). The picker label and option presentation were separated
  locally to keep the component readable. Dryer at 0.8 reports only the existing
  untouched PluginsTab/SkillsTab pair. The installed mutator's targeted Web flag
  mutant was killed (one executed, zero survivors).

Commands: `bun test --coverage --coverage-reporter=lcov` over model-picker,
composer-tools, runtime and Settings AI tests; `bun run typecheck`; affected-file
`bunx eslint`; `crapper --use-existing-coverage`; `dryer --threshold 0.8`; and
`mutator --lines 43 --use-existing-coverage` over composer-tools with its focused
tests. SDK checks used `npm run typecheck`, pinned `node scripts/generate.mjs`,
and `node --import tsx --test tests/assistant-ui.test.ts`.

Backend integration, live browser acceptance, full production build and
deployment are parent-owned and have not been established by these fixtures.
