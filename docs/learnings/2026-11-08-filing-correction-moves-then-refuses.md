---
title: A filing correction can move the note and then refuse
kind: gotcha
rule_short: A 400 from a Documents v2 filing correction does not mean nothing changed; read the collections back before trusting the error.
---

# A filing correction can move the note and then refuse

## Trigger case

In the Notes e2e run on 2026-11-08, a note was dragged into a new folder (file,
then correction: 201). It was then moved to "No folder" through Move to (file
again: 200 with the latest receipt, then correction to the auto collection
"Notes"). That correction answered `400 projection_mismatch`, "the document has
no active CommonPlace membership". The e2e check "Move to takes it back to the
top level" still passed. Reading the collections afterwards showed the note was
in no collection at all: not in the folder, and not in "Notes".

A fresh probe that used an existing folder moved the note back and forth with
201 every time. The bad case came from an account where earlier runs had left
"learned" and "precedent" filing rules behind.

## Cause

`correct_document` in `rustyred-thg-filing/src/theoremweb.rs` runs the
correction cascade and stores the result before it calls
`assert_one_membership`. When that check fails, the request answers 400, but
the store has already changed.

## Rule

- Treat a 400 from a correction as "state unknown": refetch the collections,
  and do not roll the UI back to where the note was before.
- The UI's `useMoveNote` invalidates the collections on settle, so its list
  ends up right. Its error alert still shows, even though the move happened.
- The fix belongs in Theorem: either check before changing the store, or keep
  exactly one membership.

## How it was found

The e2e lib used to record only the status and path of a refused write. It now
appends the start of the response body for any write that gets a 4xx back
(`scripts/e2e/lib.mjs`), so the reason appears in "Errors seen".
