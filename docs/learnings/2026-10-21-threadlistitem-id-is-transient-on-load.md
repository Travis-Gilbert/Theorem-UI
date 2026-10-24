# threadListItem.id changes during load, so it cannot key per-conversation UI state

**Kind:** gotcha
**Captured:** 2026-10-21T22:56:59Z
**Session signature:** `d116c101-a8fc-41d8-866c-608db59e5122`
**Domain tags:** frontend, assistant-ui, routing, persistence

## Trigger

The dock saved its layout tagged with `useAuiState((s) => s.threadListItem.id)`
and removed artifact panels whenever that id differed from the saved one.
Reloading `/c/chatthread_sha256:91ac…` with an artifact open restored the
layout and then dropped the artifact panel: `TheoremRuntimeProvider` starts on
a fresh local thread and only then switches to the routed thread, so the id
passed through a transient value and the "conversation changed" branch fired.

## Rule

Key per-conversation UI state on the routed threadId from useParams, and treat undefined to an id as the same conversation.

A new chat at `/` has no routed id until its first send navigates to
`/c/$threadId`; that transition must keep what the run already opened.
`threadListItem.id` is fine for state that may reset harmlessly, like the
phone drawer.

## Evidence

- `src/routes/_chat.tsx` passes `threadId` to `ChatShell` and on to `DockShell`
- `src/components/shell/dock.tsx` (thread effect skips clearing when the previous id is undefined)
- Browser check: after the fix a reload kept the "Artifact revisions" tab and the card's `data-selected`

## Encoded in

- `docs/learnings/2026-10-21-threadlistitem-id-is-transient-on-load.md` (this file)
