# A file sync that waits for the view to report a rename drops the next change at the new path

**Kind:** postmortem
**Captured:** 2026-11-03T00:00:00Z
**Session signature:** `f2113cfa-10e6-4796-b37e-ab79a5b35fbd`
**Domain tags:** workspace-client, file-sync, handlers, rename

## Trigger

In PR #25, `TextFileSync` (`src/lib/handlers/file-sync.ts`) followed a rename only when the view called `moveTo` after it re-rendered with new params. The workspace event stream can deliver `renamed` and then a `changed` at the new path before that render. The sync still filtered on the old path, so it dropped the `changed`. Later it wrote its stale text over the new content. A folder rename was missed the same way, because the event names the folder, not the file. Review on the PR found this (fixed in `f4c2e36`).

## Rule

- Whatever filters an event stream by path has to apply `renamed` events itself, in order, before it reads the next event. Match the file's own path and any folder above it (`path === from || path.startsWith(from + '/')`). Don't depend on a UI round trip to update the path.
- Keep `moveTo` idempotent, so the view's later call does nothing.
- The test sends `renamed` and then `changed` with nothing awaited between them.

## Evidence

- `src/lib/handlers/file-sync.ts` (`movedPath`, the `renamed` branch at the top of `onEvent`)
- `src/lib/handlers/file-sync.test.tsx` ("a change at the new path that comes before the view sees the move is kept"; "a file follows its folder when the folder moves")

## Encoded in

- `docs/learnings/2026-11-03-file-sync-must-follow-renames-itself.md` (this file)
