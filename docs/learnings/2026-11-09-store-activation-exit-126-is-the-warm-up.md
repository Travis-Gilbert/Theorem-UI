# A store image swap exits 126 while the store warms up; poll /ready instead

**Kind:** gotcha
**Captured:** 2026-11-08T04:25:00Z
**Session signature:** `c68c7220-2fd3-4fbe-ae9c-70a568ba8ddf`
**Domain tags:** fly, theorem-store, release

## Trigger

`fly machine update 8147d9b9996e58 -a travis-theorem-personal-store --image <digest> --yes
--wait-timeout 600` printed "failed to wait for health checks to pass: context deadline
exceeded" and exited 126. The machine was started on the new image with its config otherwise
unchanged; its prewarm took 314 s before `/ready` answered 200 and Fly's `store_ready` check
passed. Codex's activation on 2026-11-08 at 02:39Z exited 126 the same way.

## Rule

- Treat exit 126 from the swap as "not yet healthy", not as a failure. Read the machine back
  and compare its config with the saved one; only `image` may differ.
- Then poll `/ready` through `fly proxy <port>:8380 <private_ip> -a
  travis-theorem-personal-store` for up to 30 minutes. Wait for `{"status":"ready"}` and
  `store_ready` passing before anything depends on the new image.
- Do not restart the machine during the wait; that restarts the prewarm.

## Evidence

- Readiness body: `"residency_mode":"prewarm","prewarm_tenants_ready":1` after 314 s
