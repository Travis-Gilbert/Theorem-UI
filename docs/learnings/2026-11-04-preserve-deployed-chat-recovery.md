# Preserve the deployed chat recovery fixes during conversation integration

Release preflight identified Cloudflare production version
`c9bc71bf-6ae2-43ef-bc70-974158d41d2a` as source
`c4c645d959e2bac87d28cd3be1317266618ea5da`. That deployed commit was not an
ancestor of `origin/main` at `6d5fc4512d0adce1776d4bb525456e9d325e65f2`.
Deploying the conversation branch from main alone would have removed five
already deployed fixes:

- `bcb9688`: finish a saved send that Theorem definitively refuses.
- `21ab4db`: retain loaded history when assistant-ui replaces its adapter.
- `4f5cd55`: let the next note Ask proceed after a refused send.
- `efcdb3e`: ignore textmode setup after Life has been destroyed.
- `5b9ec04`: retain refused text for its own chat until that chat opens.

Merge the deployed head into the conversation branch, preserving its history.
The note Ask resolution keeps both definitive-refusal recovery and canonical
saved-document revision admission. A recovered old request retains its original
context; a new request after a definitive refusal re-admits the current saved
revision. Composer references are consumed only for a newly accepted request.

The Weave merge driver again dropped required runtime imports without a
conflict. Replaying with Git's built-in text merge exposed the missing
`useAuiState`, `holdRefusedText`, `pendingSendKey`, and `takeRefusedText` imports.
The resolution follows the text merge, retaining the conversation-refresh import
and both sides' behavioral tests.

Validation and deployment status are recorded below. The terminal WASM and IDE
assets are unchanged from the previously verified build; the production app
build reuses those assets and runs the Cloudflare Vite/Nitro stage without Cargo.

## Verification

- Imported and intersecting recovery/context tests: 70 passed.
- Integrated conversation, Documents, blocks, rendered Markdown, notes,
  artifacts, composer references and Life tests: 371 passed, 1,080 assertions.
  The serial run exited 0. An earlier run concurrent with production bundling
  hit two iframe preparation timeouts; neither wait was increased, and both
  passed against the same frozen source after bundling finished.
- `bun run typecheck`: exit 0.
- ESLint for all nine imported or resolved source/test files: exit 0.
- `NITRO_PRESET=cloudflare_module bun --bun vite build`: exit 0, producing the
  Worker configuration and public assets. Existing terminal/IDE assets were
  reused as described above; no Cargo invocation was needed.
- Built-in text-merge comparison found no unexplained changes beyond the
  documented conflict resolutions and the two added cross-merge regressions.

Evidence logs are in
`/Volumes/SSD Samsung/theorem-chat-search-tmp/app-ui-evidence/deployed-merge-*.log`.
This record establishes source parity and build/test evidence; it does not
claim that the merged candidate has been deployed or passed live acceptance.
