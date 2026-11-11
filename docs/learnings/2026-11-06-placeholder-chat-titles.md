# Placeholder chat titles and revision-safe naming

## Defect and owner

The backend persists `New Chat`, while the UI only generated a title when the stored title was falsy. Existing chats therefore retained the placeholder. The prior title-write race described in `2026-10-21-title-write-races-revision-checked-send.md` also matters: assistant-ui calls `generateTitle` alongside a send, and a concurrent title PATCH can invalidate the SDK's revision check.

## Change

The existing runtime adapter now recognizes blank and `New Chat` placeholders. List and fetch project the first canonical user message into a title without changing the durable revision; custom titles remain unchanged. Local messages provide a fallback only before canonical user history exists. The existing whitespace and sixty-character title formatting is retained.

`generateTitle` is read-only. `runTurn` writes an untitled chat's name before the SDK reads its revision and sends, after pending-send recovery. A conflicting title write rereads both title and revision; a concurrent custom rename wins. Two conflicts stop automatic naming so the SDK can reread current state. This cannot use the generic revision-retry helper because that helper does not recheck whether a concurrent writer chose a custom title.

Existing placeholder rows recover through bounded read-only history requests. The installed `p-map` library is now a direct pinned dependency (7.1.1), with four concurrent reads, a ten-second timeout, no retry, and per-row failure isolation. Terminal/document exclusions and origin metadata remain unchanged. Existing titles become durable on the next send; merely opening the sidebar performs no title writes.

## Action log and evidence

1. Inspected the real runtime, backend default, SDK history conversion, and prior title-race learning.
2. Ran four actual adapter regressions against the real SDK/fetch fixture: all four failed on the placeholder/read-write ordering behavior (`title-runtime-red.log`).
3. Restored the single send owner for title writes and added read-only projections, reusing SDK message conversion and p-map.
4. Added canonical/local-history, custom-name, empty-content, truncation, bounded-concurrency, inaccessible-row, and concurrent-rename controls. The combined runtime/helper suite passes 23 tests and 63 assertions, including all nine existing send-recovery controls (`title-suite.log`).
5. Measured actual Bun LCOV with Crapper: new helper functions CRAP 3/4/8 at 100% coverage; title write owner 6 at 100%; metadata 5 at 100%; existing list adapter 5.5 with all-method coverage 54.7%. Unchanged history/runtime-hook owners retain inherited CRAP 15/25.2; no claim that the entire runtime meets the threshold. Dryer found no candidates at similarity 0.8.
6. Installed Mutator killed all six selected actual-source mutations: four placeholder predicate changes and two custom-name/title-write guard changes. Worker overlays materialized project source to prevent Bun realpath imports from escaping back to unmutated files (`title-mutator.log`); no survivors or infrastructure failures.
7. Combined release checks and rendered production sidebar acceptance remain separate pending gates.

Evidence is under `/Volumes/SSD Samsung/theorem-chat-search-evidence/title-*`. No live deployment is claimed by this record.
