# Background completions can arrive in the middle of visible history

A durable background completion can commit before a newer user/assistant turn
while the browser is still displaying the previous history. Matching the local
last message to the durable last message does not prove the histories are equal.
The old refresh only appended a tail, so it omitted that completion until reload.

`src/lib/theorem/conversation-refresh.ts` now fills those gaps as well as extending
the tail. It reuses the SDK history conversion and assistant-ui's exported
repository/import operations. A gap must be a canonical assistant-to-assistant
parent chain anchored by a visible message ID or assistant run ID. User text,
position, and absent run IDs do not establish identity. The current-head,
loading, active-run, and in-flight-history-change fences remain in place.

Insertion reparents only the selected local successor. Existing message entries
retain their IDs and metadata; the adapter passes their exported run configuration
through the import payload, and other branches remain available. The installed
assistant-ui repository does not itself round-trip that runConfig field; the
regression asserts preservation at the adapter boundary, not library persistence. The composer is not replaced. Repeated polls do not duplicate the
completion. This is an adapter-specific reconciliation of durable Theorem
parent/run identities, not a second message store or a replacement SDK runtime.

## Evidence

The actual assistant-ui `LocalRuntimeCore` regression first failed because
refresh returned false for a completion before a newer local-ID turn. Additional
review regressions detected overwriting an already-exported side-branch entry
and treating an unmatched ordinary reply as a background answer.

- Focused runtime suite: 19 tests passed, including canonical-parent refusal,
  local-ID later turns, draft preservation, actual alternate-branch switching,
  chained completions, and idempotent polling.
- Existing affected chat/App suite: 97 tests passed, 357 assertions, 9 files.
- Full `bun run typecheck`, changed-file ESLint, and
  `NITRO_PRESET=cloudflare_module bun --bun vite build`: exit 0.
- Actual Bun LCOV: each owner function has 100% line coverage; maximum CRAP 9.
- Dryer at 0.8: no duplicate candidates.
- Installed Mutator: four assertion-confirmed kills for omitted insertion,
  ignored canonical parent, overwritten existing entry, and ordinary-reply
  admission. Source overlays were removed; the working source was unchanged.

Commands, source hashes, RED/GREEN logs, coverage, mutation receipts and build
output are retained in
`/Volumes/SSD Samsung/theorem-chat-search-evidence/middle-completion-ui/`.
This local runtime and production-build evidence does not replace the remaining
signed-in live check after deployment: a racing background completion must appear
without reloading the chat. No model/provider behavior or backend source changes
are part of this repair.
