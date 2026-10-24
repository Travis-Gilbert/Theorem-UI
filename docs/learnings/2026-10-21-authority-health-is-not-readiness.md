# The Theorem authority's /health returns 200 while every API call hangs

**Kind:** gotcha
**Captured:** 2026-10-21T05:00:00Z
**Session signature:** `8cc1eafd-4081-4cc2-b179-7b59507a35b5`
**Domain tags:** thg, rustyred, smoke-test, ops

## Trigger

After two restarts of `rustyred-thg-server` with a 4.6 GB store,
`launch.sh` reported "server up after 2s" from `/health`. API calls then hung
for over 60 s. The log showed `RUSTYRED_THG_RECOVERY_FAILED configured tenant
prewarm timed out after 180s`. The node became usable only when
`RUSTYRED_THG_RECOVERY_READY` appeared, about 3 to 3.5 minutes later, because
`mark_ready()` runs even after the timeout has marked the node Failed.

## Rule

Gate smoke tests on `RUSTYRED_THG_RECOVERY_READY` in the authority log, not on `/health`, and treat `RECOVERY_FAILED ... timed out` as "still warming", not dead.

Check free disk space before long runs as well. In the same session the internal disk
hit 172 MiB free, and the store failed with `chunk_store` persist errors and
"No space left on device", which left a run stuck with no parts.
`RUSTY_RED_RECOVERY_TIMEOUT_SECS` raises the prewarm deadline.

## Evidence

- `rustyredcore_THG/crates/rustyred-thg-server/src/lib.rs` (recovery timeout; `mark_failed_if_recovering`)
- `rustyredcore_THG/crates/rustyred-thg-server/src/state.rs` (`mark_ready` is unconditional)
- `~/.theorem/theorem-ui-local/authority.log`

## Encoded in

- `docs/learnings/2026-10-21-authority-health-is-not-readiness.md` (this file)
