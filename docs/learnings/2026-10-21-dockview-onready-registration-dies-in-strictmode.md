# Store registration done in dockview's onReady is undone by StrictMode's effect replay

**Kind:** postmortem
**Captured:** 2026-10-21T22:56:59Z
**Session signature:** `d116c101-a8fc-41d8-866c-608db59e5122`
**Domain tags:** frontend, react, strictmode, dockview, zustand

## Trigger

`DockShell` put the dock's open/expand/close handlers into the zustand
artifact store inside `onReady`, and cleared them in a `useEffect(() => () => …, [])`
unmount cleanup. In dev, clicking an artifact card selected it but no panel
opened and nothing was logged: StrictMode ran the cleanup once on mount, which
set `dock: undefined`, and `DockviewReact` never called `onReady` again, so the
store kept no dock for the rest of the session.

## Rule

Have onReady only build or restore the layout and store the api in state; register listeners and external handlers in an effect keyed on that api.

`useEffect(() => { if (!dock) return; …register…; return () => …unregister… }, [dock])`
survives StrictMode's mount, unmount, mount replay, because the replayed mount
registers again. Any one-shot library callback (`onReady`, `onLoad`, `onInit`)
has the same hazard when its setup is paired with an effect cleanup.

## Evidence

- `src/components/shell/dock.tsx` (`setDock(api)` in `onReady`; registration effect on `[dock, projectId]`)
- Browser check before the fix: `[aria-label^="Artifact:"]` absent and only two `.dv-tab`s after clicking "Open Artifact revisions"

## Encoded in

- `docs/learnings/2026-10-21-dockview-onready-registration-dies-in-strictmode.md` (this file)
