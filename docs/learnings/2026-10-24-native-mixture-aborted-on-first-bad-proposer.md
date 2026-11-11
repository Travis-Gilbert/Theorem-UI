# One malformed proposer ended the whole native mixture as "usage unavailable"

**Kind:** postmortem
**Captured:** 2026-10-24T04:30:00Z
**Session signature:** `db3cd1e1-8651-4b1d-8478-8ecfec039362`
**Domain tags:** thg, mixture, delegation, metering

## Trigger

In the same live check, a deepseek proposer returned fully metered usage
(3561 tokens, `finish: stop`), but one entry lacked `kind`, `responds_to` and
`tool_id`. `TaskOwnedNativeInvoker::execute` returned `Err` on the missing
field. `guarded()` turns every `Err` into a refused contribution with
unavailable usage, and `NativeMixtureBackend` breaks out of all rounds on the
first unmeasured contribution. So flint, the second proposer, never ran. The
delegation reported `usage_unavailable`, which pointed at metering rather than
at the model's output.

The malformed output had a second cause. `PromptSpec::from_request` always put
`default_claims_schema()` (`claims_json`) in the prompt's field schema, even
when the request carried its own `response_schema`. The head's reasoning quoted
both contracts and tried to satisfy both.

The live recheck after that fix found the same abort on the tool path.
deepseek asked `workspace.overlay.read` for `hello.txt` before creating it,
and the gateway answered `refused_before_effect` ("No such file or directory").
The adapter still returned `Err` for every dispatch error, so a provably
effect-free refusal also ended the mixture as unknown usage.

## Rule

After a metered provider call, treat output that fails to parse or validate as that proposer's failed contribution with its measured charge; keep `Err` (unknown usage) for calls with no receipt or where an effect may have happened. A tool refusal before effect goes back to the proposer as evidence.

A request's `response_schema` is the only output contract shown to the head.

## Evidence

- `rustyredcore_THG/crates/theorem-harness-runtime/src/mixture_execution.rs` (`execute`, `guarded`, `call_entries`)
- `rustyredcore_THG/crates/theorem-mixture/src/backends/native.rs` (`measured.is_none()` stops all rounds)
- `rustyredcore_THG/crates/theorem-prompt/src/lib.rs` (`PromptSpec::from_request` field schema)

## Encoded in

- `docs/learnings/2026-10-24-native-mixture-aborted-on-first-bad-proposer.md` (this file)
- Tests `mixture_malformed_proposer_output_fails_only_that_proposer`, `mixture_read_of_a_missing_path_is_evidence_and_the_proposer_continues` and `request_response_schema_replaces_the_claims_field_schema`
- Commits `04d6edf089`, `8ca55bc1c9`, `a14bdba0dd` on `claude/terminal-run-mixture`
