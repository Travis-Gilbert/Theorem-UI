# Splitview addPanel without a size evenly redistributes every view

**Kind:** gotcha
**Captured:** 2026-10-23T18:00:00Z
**Session signature:** `1659a004-49a7-481e-b157-340073e0f5a4`
**Domain tags:** dockview, shell, layout

## Trigger

The chat sidebar always opened at its 360px maximum on a 1169px window, even
with `panelWidth: 224` in `theorem-ui:shell` storage. `SheetSplit` added the
panel with `size: panelWidth`, then added the dock with no `size`. dockview's
`addView(view, size = Sizing.Distribute)` then split the width evenly across
all views, and the panel clamped to `maximumSize`. The saved width never
applied.

## Rule

Give every `SplitviewApi.addPanel` call an explicit `size` (the last one gets `api.width` minus the others); an omitted size resets the sizes already set.

## Evidence

- `node_modules/dockview-core/dist/dockview-core.js` (`addView`, `distributeEmptySpace`)
- `src/components/shell/chat-shell.tsx` (`SheetSplit` `onReady`)

## Encoded in

- `docs/learnings/2026-10-23-dockview-splitview-addpanel-without-size-redistributes.md` (this file)
