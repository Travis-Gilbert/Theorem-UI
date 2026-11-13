# Files recovery

The signed-in production Files panel failed on 2026-11-13 because its vault
request exhausted the Cloudflare Worker's memory. The response was HTTP 503,
Cloudflare 1102; a filtered live worker tail confirmed `exceededMemory` and
`Worker exceeded memory limit.` The UI hid Home when that request failed.
The Fly relay now reaches Files authentication; its earlier 404 is no longer
the current failure.

The repair preserves Home's failure with Retry, exposes the vault query's own
error/refetch state, and gives Files a lazy Nitro route that reuses the existing
OAuth and streaming proxy. H3 cookie helpers preserve the same iron-session
boundary without initializing the UI router. Cloudflare output is minified,
and the shared icon module exports only the icons its callers actually use.

## Evidence

- Focused H3/session/error tests pass 10/10. They cover sealed session reading,
  sign-out/refusal, refresh, binary PUT/precondition forwarding, and response
  streaming before upstream closes, plus the rendered Retry action. Upstream
  HTTP in these tests is an explicitly named stand-in.
- The Cloudflare build passes. Terminal WASM was rebuilt from this checkout's
  own source using a pooled Cargo target. TypeScript checking reports only the
  pre-existing ReactNode/Element mismatch in
  `src/components/pages/conversation-module.test.tsx:27`.
- The downloaded production worker version
  `130a1fa1-aaef-4116-8c44-8d4c58613b3e` and built candidate ran in local workerd
  with loopback bindings. After a Files GET, `Runtime.getHeapUsage` reported
  146,723,900 bytes for production and 94,224,408 bytes for the candidate. After
  also loading the candidate's root route, its used heap was 108,495,492 bytes.
  That root request returned 500 because this measurement used an absent
  loopback authority. These are local memory measurements, not production
  capacity or rendered-product claims.
- The server icon module shrank from 7,786,951 to 13,630 bytes. Candidate
  JavaScript modules total 34,650,943 bytes. The production module download
  was 59,010,705 bytes including WASM and multipart metadata; those totals are
  not identical measures.
- The repository's local OAuth stack and rebuilt shipping native server opened
  Home, created and renamed `Files acceptance November 13.md`, and saved
  `Files acceptance: café, 日本語, and durable save.` through the real Files
  endpoint. The development identity provider is a stand-in; Files and its
  journal are real. The server artifact SHA-256 was
  `a84271132c952ce62c0cb54d29417303c15ec9602b4fc4a6f4496081a6a7f111`.
- The exact text survived SIGKILL and a fresh server/UI startup with the same
  journal. Reload displayed `Saved to Home`. An explicitly simulated vault
  HTTP 503 rendered `Home could not load` and Retry; clearing the interception
  and clicking Retry restored the saved document from the real server.

No production data or worker was changed. Local request interception was
removed and the two workerd measurement processes were stopped. Evidence logs
are `/tmp/pr1066-ui-stream-tests.log`, `/tmp/pr1066-ui-worker-build4.log`,
`/tmp/pr1066-worker-heap-final.jsonl`, and
`/tmp/pr1066-worker-heap-after-home.jsonl`. Downloaded worker artifacts are
retained under the SSD's `codex-rebuildable-cache/pr1066-worker-evidence`.

## Remaining release gates

Recheck the real UI against the final backend artifact after the PR's remaining
storage/query repairs. Production rollout and authenticated theorem.rs
read/write/reopen remain required. The separate integration session's backend
upgrade rehearsal is blocked by a malformed historical chat-upload record;
this frontend evidence does not waive that storage gate.
