# Show authoritative worker failures alongside reports

Live conversation acceptance exposed a failed App builder whose report claimed
it had built an App. The native receipt correctly recorded an iteration-limit
failure, but the card rendered only `reported.summary` and interpretation
problems, omitting `receipt.terminal.message`.

The existing card now shows the typed failed-terminal message before the
worker's report. A separate interpretation problem remains visible; identical
messages appear once. This reuses the SDK receipt and existing alert rendering,
with the platform Set for deduplication. No new parser, client or dependency is
needed, and the worker's report remains inspectable rather than being rewritten.

## Evidence

- Two rendered regressions first failed because the actual failure was absent.
- Four rendered tests pass: failure before optimistic report, separate/deduplicated
  problems, successful work, and queued work without a receipt.
- Typecheck, affected ESLint, and the Cloudflare production build pass.
- Three actual mutator sites were killed by rendered assertions. Each isolated
  run recorded the changed source hash and copied physical test to avoid symlink
  resolution selecting the unmutated source. No setup or compilation failures
  were counted as kills; the original source remained unchanged.
- Crapper reports the new helper at CC4, 100% line coverage, CRAP4. The existing
  large card renderer drops from CC39 to38; its pre-existing metric debt is not
  presented as newly passing. Dryer at0.8 found no candidates in the file.
- Independent read-only review found no blocking issue.
- The broader suite has852 passes and12 failures. An exact f13d187 source archive
  using the same dependencies reproduces the same12 failures with848 passes.
  They concern desktop unsaved-state, listener HTTP fixtures and media fixtures;
  this patch adds four passing tests and no new failed selector.

Logs and executed mutation receipts are under
`/Volumes/SSD Samsung/theorem-chat-search-evidence/ui-worker-failure-*`.
Deployed UI source5711b42 as Worker version
a204a385-3627-4f45-8c10-a8a9d9325a1c. Signed-in browser reload shows the
authoritative iteration-limit failure before the optimistic worker report.
Full accessibility and screenshot evidence: `live-worker-failure-fixed.txt` and
`live-worker-failure-fixed.jpg` in the same evidence directory. Runtime builder
repair and successful App publication remain separate open acceptance gates.

## Model capability wording

The catalog's tools flag reports provider-native tool calling. Program-based
models can still execute Theorem search and work operations. The settings column
now says Native tools, with enough width for that label; its type comment states
the same boundary. No runtime behavior or parser changed, and a test mirroring
the label would not establish tool execution. Typecheck, affected lint and the
production build passed; rendered settings verification follows deployment.
