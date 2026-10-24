# dockview addPanel without a position joins the active group, even an edge group

**Kind:** gotcha
**Captured:** 2026-10-21T22:56:59Z
**Session signature:** `d116c101-a8fc-41d8-866c-608db59e5122`
**Domain tags:** frontend, dockview, layout

## Trigger

The first default layout called `api.addEdgeGroup('left', …)`, added the
sidebar panel with `position: { referenceGroup: edge.id }`, then added the
thread panel with no position. The thread landed as a second vertical tab in
the left edge group ("Chats", "New chat") and the grid stayed empty, so the
conversation rendered 170px wide beside a blank main area. dockview places a
position-less panel in the active group, and the edge group had just become
active.

## Rule

Add the main grid panel before creating edge groups, or give every addPanel an explicit position.

The same applies after `fromJSON` or `clear`: whatever group is active receives
the next position-less panel. Mark edge-group panels `inactive: true` so they
do not take focus from the grid.

## Evidence

- `src/components/shell/dock.tsx` (`buildDefaultLayout` adds `THREAD` first)
- Browser check: `.dv-groupview` widths were `[256 edge, 768 grid]` with the thread in the grid only after the reorder

## Encoded in

- `docs/learnings/2026-10-21-dockview-addpanel-joins-active-edge-group.md` (this file)
