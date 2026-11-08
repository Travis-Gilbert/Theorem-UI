# Release the store before the UI that needs its contract

**Kind:** postmortem
**Captured:** 2026-11-08T04:30:00Z
**Session signature:** `c68c7220-2fd3-4fbe-ae9c-70a568ba8ddf`
**Domain tags:** deploy, cloudflare, fly, theorem-store, kit

## Trigger

Theorem-UI PR #41 (Kit client operations) merged to main at 2026-11-08T00:52Z. A push to UI main
deploys theorem.rs through Workers Builds, but no GitHub workflow deploys the Theorem store; it
changes only by a manual `fly machine update`. Main's UI then went live against a store image
built before Kit. Every send failed with 422 `invalid_chat_request`, "unknown field
`clientOperations`", until the UI was rolled back by hand to Worker version `26c3d848`. The
fix reached production only after a store image from Theorem main (`kit-6aaa2c3371`) was
activated and `/ready` returned 200. Then Worker version `4843151b` went to 100%.

## Rule

- When a UI change sends a field the store must accept, release the store first: build, swap
  only the image, wait for `/ready`. Upload the UI as a Worker version with no traffic
  (`wrangler versions upload`), and run `wrangler versions deploy <id>@100%` only after the
  store is ready.
- Until the store is released, don't push to UI main: Workers Builds deploys it.
- Before a UI release, read the live store image (`fly machines list -a
  travis-theorem-personal-store --json`) and confirm that its source commit contains the
  backend half.

## Evidence

- Codex evidence `kit-release/contract-refusal.json` (correlation `chatreq_01M6WH19XG57W3H9N1DHT187KN`)
- Store rollback `sha256:d1e4727a…`, new `sha256:351d41b4…`; UI rollback `26c3d848`, new `4843151b`
