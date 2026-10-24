# A list's data-active can land in a later commit than the id that caused it

**Kind:** anti_pattern
**Captured:** 2026-10-23T18:00:00Z
**Session signature:** `1659a004-49a7-481e-b157-340073e0f5a4`
**Domain tags:** assistant-ui, react, motion

## Trigger

`useGlideHighlight` re-ran on a placement key built from
`threads.mainThreadId`. On a thread switch the key changed in one commit, but
`ThreadListItemPrimitive` set `data-active` on the new row in a later one.
The layout effect found the old active row and glided there.

## Rule

When motion follows DOM state that other components own, watch the DOM (a MutationObserver on the attribute plus childList) instead of a React key that only predicts it.

## Evidence

- `src/components/motion.tsx` (`useGlideHighlight` observes `attribute`)

## Encoded in

- `docs/learnings/2026-10-23-selection-attribute-lands-in-a-later-commit.md` (this file)
