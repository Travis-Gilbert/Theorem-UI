# Maximizing a dockview group hides every other header, and derived panel state goes stale on parameter changes

**Kind:** postmortem
**Captured:** 2026-11-03T00:00:00Z
**Session signature:** `f2113cfa-10e6-4796-b37e-ab79a5b35fbd`
**Domain tags:** dockview, shell, arrangements, inspector

## Trigger

This came from PR #25 (`claude/unified-workspace`), which adds the Focus, Work together and Explore arrangements. Three problems turned up.

1. The panels menu, which holds the arrangements, was a header action on the conversation's group only. Focus maximizes the document's group, and dockview then hides every other group's header. So Focus removed the only way back out of Focus. All 9 headless tests passed. The browser check found it (fixed in `cf456ff`).
2. The inspector worked out which file to show only on `onDidActivePanelChange`, `onDidAddPanel` and `onDidRemovePanel`. A file panel learns its entry id late, and a rename calls `updateParameters` on the same panel. Neither event fires for either change, so the inspector kept showing the old path. Review found this, not the tests (fixed in `47645ba`).
3. Panels with `renderer: 'always'` (the graph) render into `.dv-render-overlay`, not inside the group's element. The graph also loads lazily. Looking for its canvas under the group returned nothing, and the panel seemed empty when it was not.

## Rule

- Any control that leaves a dockview state must be reachable in that state. Header actions decide whether to show by state, for example `group.api.isMaximized() || holds the conversation`, and re-read it on `onDidMaximizedGroupChange`.
- State worked out from panel params must also subscribe to each panel's `api.onDidParametersChange`. Subscribe on add and dispose on remove. Active, add and remove events are not enough.
- To find an `always`-rendered panel's DOM, look in `.dv-render-overlay` and wait for the lazy chunk.
- Test a dock headlessly with `new DockviewComponent(el, { createComponent })` and `layout(1200, 800)`. Still click through every arrangement in a browser, because a hidden header does not appear in headless tests.

## Evidence

- `src/components/shell/arrangements.ts` (`holdsPanelsMenu`, `followFront`)
- `src/components/shell/arrangements.test.ts` ("the panels menu sits with the conversation, and on the group Focus fills"; "the inspector follows the file in front as it learns its entry and moves"; "the inspector keeps a file another panel has focus over, through a rename")

## Encoded in

- `docs/learnings/2026-11-03-dockview-maximize-hides-the-only-menu.md` (this file)
