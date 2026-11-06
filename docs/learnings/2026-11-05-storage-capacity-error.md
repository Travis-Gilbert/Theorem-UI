# Explain a confirmed journal capacity failure

The mounted chat failure exposed a journal ENOSPC detail without useful recovery guidance. The existing SDK error presentation owner now recognizes only `chat_store_error` with `chunk_store_journal_io` and `No space left on device (os error 28)`. It explains exhausted server storage and asks the user to retry after capacity is restored. The public error codes and request reference remain visible. The message makes no claim about whether a particular write committed.

This is a narrow extension of the existing `describeError` owner, not another response parser. Permission failures, poisoned-store errors, other error codes, and missing details keep their existing descriptions.

## Action log and evidence

1. Bound the fixture to the backend `chat_error(Store)` source and the exact detail/reference shown in the live UI. The HTTP body itself was not captured; this is explicitly a source-bound fixture.
2. Observed the new capacity-description assertion fail before implementation while unrelated-error controls passed.
3. Added the narrow presentation helper and a rendered Thread alert regression. All 42 focused client, error-history, and send-recovery tests passed. The alert retains both public codes and the correlation reference without guessing persistence status.
4. Killed all four actual mutations in the new helper, including the missing-detail optional-chain mutation. The helper has 100% reported coverage and CRAP 5. Dryer at 0.8 found no duplicate candidates.
5. The existing `describeError` remains above the ub-mode CRAP target: baseline CC31, current CC32/CRAP32.6. The extra optional access reads the public error code; broader error-parser restructuring is outside this explicitly bounded repair. No claim is made that the legacy owner meets the target.
6. Typecheck, scoped ESLint, and the Cloudflare Vite/Nitro build passed. The build reused unchanged terminal/Theia assets and ran no local Rust compiler.

Private evidence uses the `storage-error-*` prefix under `/Volumes/SSD Samsung/theorem-chat-search-evidence`. The parent task restored mounted capacity. This presentation change is deployed in source `f52494c691dc352fb2e44747cd59d0b86c38d21d`, with the automatic build/version mapping recorded in `2026-11-05-composer-search-submit.md`. The friendly alert passed the rendered component regression; no live storage outage was forced to test it. This change improves the explanation; it does not itself provision storage.
