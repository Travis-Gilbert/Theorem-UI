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
composer Plan/Effort branch. Live authenticated model-switch and response checks
remain separate from fixture tests.
