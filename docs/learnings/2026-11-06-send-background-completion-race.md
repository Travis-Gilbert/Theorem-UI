# Sending while a background completion advances the chat

## Behavior and cause

A separate user send could fail with `chat_revision_conflict` when a background completion committed between the SDK's authoritative snapshot read and its append command. The failed user message was not persisted. The exact revision is owned by the shipped SDK's assistant-ui adapter, so recovery belongs at that existing send boundary.

The backend reserves an idempotency key before checking the revision; the request hash includes the expected revision. Reusing that refused key with a new revision would conflict. Ambiguous failures still need the original body and key, so a general retry or backend auto-rebase is unsafe.

## Change

The fresh-send path may retry once after an explicit HTTP 409 `chat_revision_conflict`. It rereads the authoritative snapshot and requires idle before/after state, a strictly advanced revision, unchanged scope (including title/branch/project and unknown metadata), an identical message prefix, and only assistant messages with run IDs linked as a parent chain after the prior assistant. Cancellation is checked before and after rereading. The retry preserves the command/model/context and uses the refreshed revision and a new key. A second conflict escapes normally.

Known edit/retry commands, pending-run recovery, ambiguous transport errors, intervening user/edit/title changes, active runs and pending turns do not use this path. This cannot remove all concurrent-write conflicts; it recovers only the verified completion-only case.

## Packaging ownership

The vendored SDK is `0.6.0-alpha.3`, a combined release introduced in UI commit `dac76ab74a25095c3ff08ea3b10f21d425758345`. The backend checkout's SDK is older `0.4.0`; rebuilding it would regress unrelated Files/delegation behavior. The existing Bun patched-dependency mechanism applies one shared private helper and the two ESM/CommonJS fresh-send call sites to the exact shipped package. This is not a second adapter. The helper uses `dequal` 2.0.3, already declared by that SDK and resolved in the lockfile. No package versions or dependencies changed. The patch contains no generated Bun cache marker.

## Validation

- Actual installed adapter RED: the first send's explicit 409 escaped; the completion-only send regression failed before the patch.
- Actual ESM/CommonJS HTTP adapter regressions: 31 pass, 74 assertions. Covers preserved command and fresh key, exact prefix/scope/parent fences, multiple completion chain, wrong errors, second conflict, both abort windows, existing edit/retry paths, and non-assistant/empty baseline refusal.
- Clean offline `bun install --frozen-lockfile --ignore-scripts`: passed; all three patched SDK files matched SHA-256 exactly, and all 31 tests passed using that clean installation. Temporary install removed afterward.
- Affected suite: 143 tests, 448 assertions across 11 files, including existing send recovery, runtime, client, history, title and App controls.
- Typecheck, focused ESLint, and Vite/Nitro Cloudflare-module build: passed. Unchanged terminal/Theia compilation was not repeated locally.
- Actual byte-identical copied SDK owner coverage: 100% lines; all seven helper functions CRAP at most 5. Compiled adapter wrapper complexity is inherited; the two call-site replacements add no branches. Bun excludes node_modules coverage, so the complete SDK package was copied outside node_modules and the real adapter tests executed there; no algorithm was recreated.
- Dryer at 0.8 found no duplicate candidates. Its extension filter excludes `.cjs`, so it analyzed a byte-identical `.cts` copy of the helper; the source hash is retained.
- Installed Mutator: six actual-owner mutants killed by assertion failures (omit retry; ignore old messages; ignore scope; reuse refused key; retry wrong errors; ignore assistant parent). Mutants executed the actual copied package with only the named helper mutation, and originals remained unchanged.

Evidence and exact commands are in `/Volumes/SSD Samsung/theorem-chat-search-evidence/send-completion-race-ui/summary.json` and adjacent logs/scripts. The lifecycle-literal and type-import failures during test authoring were corrected in the fixture, not production code.

## Acceptance boundary

Source tests, packaging and build are verified. Cloudflare source/version deployment and signed-in completion-race acceptance remain separate release gates. This fix is not evidence that earlier model-provider HTTP 400 errors were caused by this race.
