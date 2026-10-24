# anime.js createLayout mutes transitions and restores inline styles under its root

**Kind:** gotcha
**Captured:** 2026-10-23T18:00:00Z
**Session signature:** `1659a004-49a7-481e-b157-340073e0f5a4`
**Domain tags:** animejs, motion, thread-list

## Trigger

After `useLayoutSprings` was added to the thread list, 63 elements under the
list sat at `transition: none !important`, so row hovers stopped easing.
`AutoLayout.record()` mutes every descendant's transition until the next
`animate()`. A gliding highlight placed inside the same root kept snapping
back, because the layout restores captured inline styles on every registered
descendant.

## Rule

After `layout.record()`, restore each entry of `layout.transitionMuteStore` and clear it (`recordLayout` in `src/components/motion.tsx`). Keep anything that animates its own inline styles outside the layout root.

## Evidence

- `src/components/motion.tsx` (`recordLayout`, `useLayoutSprings`)
- `src/components/assistant-ui/elements/thread-list.aui.tsx` (highlight sits beside `listRef`, not in it)

## Encoded in

- `docs/learnings/2026-10-23-anime-layout-record-mutes-and-restores-descendants.md` (this file)
