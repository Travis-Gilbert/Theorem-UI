# An offsetTop walk to a non-positioned container overshoots it

**Kind:** postmortem
**Captured:** 2026-10-23T18:00:00Z
**Session signature:** `1659a004-49a7-481e-b157-340073e0f5a4`
**Domain tags:** dom, motion, thread-list

## Trigger

After the rebase onto main, the thread-list pill sat exactly 116px from the
active row on every thread switch. `edgesWithin(target, listRef)` summed
`offsetTop` up the `offsetParent` chain until it reached `listRef`. The
inner list div isn't positioned, so it is never an `offsetParent` and the
walk ran past it. That added the outer container's 116px offset. The
highlight itself is positioned in the outer `relative` div.

## Rule

Measure an absolutely placed overlay against its own `offsetParent`, never against a container chosen for querying; the walk only stops at positioned ancestors.

## Evidence

- `src/components/motion.tsx` (`useGlideHighlight` measures in `highlight.offsetParent`)

## Encoded in

- `docs/learnings/2026-10-23-offset-walk-needs-a-positioned-container.md` (this file)
