# Read a failing Workers Builds log with the cf CLI, not wrangler or the dashboard

**Kind:** method
**Captured:** 2026-11-07T00:00:00Z
**Session signature:** `2645b10d-e6a2-4dfe-a0c5-82a13a1c2e44`
**Domain tags:** cloudflare, ci, workers-builds

## Trigger

"Workers Builds: theorem-ui" failed on every head of Theorem-UI PR #16. The Cloudflare API
answered 12004 Forbidden with wrangler's OAuth token, and the dashboard in the agent browser
was not signed in, so the cause went unknown through four pushes. The `cf` CLI
(`npm i -g cf`, signed in by OAuth) read the log at once: `terminal/build.sh: 7: cargo: not found`.
`bun run build` compiles the terminal WASM with cargo first, and the Workers Builds image has
no Rust.

## Rule

- Take the build id from the GitHub check (`gh api repos/<o>/<r>/commits/<sha>/check-runs`,
  `external_id`). Then run `cf builds get <id>` (trigger, commands, branch) and
  `cf builds logs get <id>` (the log).
- `cf builds triggers list --external-script-id <id>` shows which trigger runs. On 2026-10-25 a
  trigger created when the PR opened was the only one, and the user had it deleted.
- A Workers Builds trigger for this repo needs Rust, the wasm32 target and wasm-bindgen 0.2.127,
  plus `NITRO_PRESET=cloudflare_module`. Without them, `bun run build` cannot pass there.

## Evidence

- Build `afe1ac2b-46b0-4bd9-9ad4-8a603057994e`, trigger `7d651d6e-…` (deleted)
- `package.json` `build`: `sh terminal/build.sh && bun --bun vite build`

## Encoded in

- `docs/learnings/2026-11-07-read-workers-build-logs-with-cf-cli.md` (this file)
