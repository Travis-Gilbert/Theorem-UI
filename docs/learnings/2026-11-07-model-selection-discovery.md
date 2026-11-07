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

Typecheck, release build and deployment are pending.
