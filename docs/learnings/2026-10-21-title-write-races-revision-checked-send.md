# A title write fired from generateTitle races the SDK's If-Match send

**Kind:** postmortem
**Captured:** 2026-10-21T05:00:00Z
**Session signature:** `8cc1eafd-4081-4cc2-b179-7b59507a35b5`
**Domain tags:** frontend, assistant-ui, theorem-sdk, concurrency

## Trigger

A new chat's first message failed with `409 chat_revision_conflict`.
assistant-ui calls `adapter.generateTitle` as soon as the thread initializes
and the user message exists, which runs concurrently with the run. The SDK's
`run` reads `thread.revision`, then posts the message with `If-Match`. The
title PATCH landed in between, bumped the revision, and the send failed.

## Rule

Never write to a thread from a callback that runs concurrently with a revision-checked send; sequence the write inside the run before handing off to the SDK.

The fix titles an untitled thread in `run()` before `chatAdapterFor(...).run`,
and makes `generateTitle` report the title without writing it. The resulting
request order is create, title PATCH, GET, GET, then POST 201.

## Evidence

- `src/lib/theorem/runtime.tsx` (`titleUntitledThread`, read-only `generateTitle`)
- assistant-ui `_armAutomaticTitle` fires at `initialize`

## Encoded in

- `docs/learnings/2026-10-21-title-write-races-revision-checked-send.md` (this file)
