# A MoM head missing from the model catalog gets 1024 output tokens, and reasoning spends them all

**Kind:** gotcha
**Captured:** 2026-10-24T04:30:00Z
**Session signature:** `db3cd1e1-8651-4b1d-8478-8ecfec039362`
**Domain tags:** thg, mixture, model-catalog, openrouter

## Trigger

A live `terminal_run` check on `claude/terminal-run-mixture` delegated to
`code.implementation_mixture` three times. Every mixture stopped with
`usage_unavailable` and wrote nothing. The `MixtureInvocationReceipt` nodes
(`POST /v1/cypher` `MATCH (n:MixtureInvocationReceipt) RETURN n`) showed one
deepseek call ending `finish_reason: length` at exactly 1024 completion tokens,
and another classed `provider_error` with HTTP 200 and no receipt. That second
one is `empty_text_error`: the reasoning used the whole allowance and no content
came back. The composed heads in `composed_agent.rs::default_models()` named
OpenRouter models, but `data/models.json` had OpenRouter rows for only 4 of the
9 heads. `provider_max_output_tokens` falls back to
`DEFAULT_PROVIDER_MAX_OUTPUT_TOKENS = 1024` for any (provider, model) pair the
catalog does not know.

## Rule

When a head's model id is added or changed, add the matching `provider`/`model_id` row to `theorem-harness-core/data/models.json` in the same change, or that head runs at 1024 output tokens.

The lookup is an exact match on (provider, model id), so a dated variant such
as `deepseek/deepseek-v4.1-flash-1017` needs its own row even when
`deepseek/deepseek-v4.1-flash` exists. Take the limits from
`openrouter.ai/api/v1/models` (`top_provider.max_completion_tokens`,
`supported_parameters`). A one-line strict `json_schema` probe per model shows
whether it thinks by default (`completion_tokens_details.reasoning_tokens`) and
whether it honors the schema.

## Evidence

- `rustyredcore_THG/crates/theorem-harness-runtime/src/head_invoker/api.rs` (`provider_max_output_tokens`, `empty_text_error`)
- `rustyredcore_THG/crates/theorem-harness-core/src/model_catalog.rs` (exact-match lookup)
- `rustyredcore_THG/crates/theorem-harness-runtime/src/composed_agent.rs` (`default_models`)

## Encoded in

- `docs/learnings/2026-10-24-uncatalogued-openrouter-heads-get-1024-output-tokens.md` (this file)
