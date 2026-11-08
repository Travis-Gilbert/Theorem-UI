# A Theorem chat write retried at a newer revision needs a new idempotency key

**Kind:** gotcha
**Captured:** 2026-11-09T00:00:00Z
**Session signature:** `e5d17746-6435-4d49-a998-5ed38dd8d406`
**Domain tags:** theorem, chat, idempotency, revisions, binding

## Trigger

`bind_chat_run_to_conversation` called `link_chat_run` with `expected_thread_revision`. A title
PATCH that landed between a turn's message POST and its run start bumped the thread's revision.
The link then failed with "chat revision conflict", the run failed as
`chat_conversation_binding_failed`, and the thread kept `pendingTurn`. After a reload, every
send was refused with "This Theorem thread has a pending turn; replay its original idempotency
key". The replay had nothing to start.

The obvious fix is to re-read the thread and retry `link_chat_run` at the current revision.
Under the same idempotency key that retry fails: the receipt's request hash includes the
expected revision, and the failed attempt left a Pending receipt. A second hash under the same
key is an `IdempotencyConflict`, not a retry.

## Rule

- When a server-side authority write (link, unlink, assistant append) is retried at a newer
  revision, derive a new key per attempt, for example `{base}:r{revision}`. Keep the base key
  for the first attempt so a plain replay still dedupes.
- Retry only while the thread still names this turn: its pending turn matches the message and
  branch, or no other run is active.
- A run that fails before its link must clear the thread's pending turn. Otherwise the thread
  refuses every later send.

## Evidence

- Theorem branch `claude/chat-binding-recovery`, commit `ac0f2c1312`:
  `authority_key` and `authority_write_raced` in
  `rustyred-thg-server/src/theorem_agent_stream.rs`, and `release_unlinked_turn` in
  `theorem-harness-runtime/src/theorem_chat.rs`.
- Tests in `rustyred-thg-server/src/theorem_chat_binding_tests.rs` use a test seam
  (`WRITE_BEFORE_RUN_START`) to land a rename or a branch switch between the message and the
  run start.
- A project move in that window changes the run-start request hash (projectId), so its replay
  still gets `idempotency_conflict`. That case is not fixed.

**Rule (short):** Retrying a revisioned Theorem write needs a per-revision idempotency key, and a run that fails unlinked must release the pending turn.
