// SOURCING: dockview-react's DockviewApi (addPanel positions, the grid's width and minimumWidth). Dockview has no placement policy for side panels, so the rule below is the app's own.
import type { DockviewApi } from 'dockview-react'

type SidePanel = {
  id: string
  component: string
  params: object
  title: string
  minimumWidth: number
}

/**
 * Opens a panel in a column of its own beside `besidePanelId` (the
 * conversation), `share` of the dock wide. When the dock has no room left for
 * the column's minimum width, the panel joins a side group as a tab instead:
 * Dockview would otherwise squeeze the new group far below its minimum.
 */
export function openBeside(
  api: DockviewApi,
  panel: SidePanel,
  besidePanelId: string,
  share: number,
) {
  if (api.minimumWidth + panel.minimumWidth > api.width) {
    const side =
      api.panels.find((p) => p.id !== besidePanelId) ??
      api.getPanel(besidePanelId)
    if (side) {
      api.addPanel({ ...panel, position: { referenceGroup: side.group } })
      return
    }
  }
  const initialWidth = Math.round(api.width * share)
  if (api.getPanel(besidePanelId)?.api.location.type === 'grid')
    api.addPanel({
      ...panel,
      initialWidth,
      position: { referencePanel: besidePanelId, direction: 'right' },
    })
  else
    api.addPanel({ ...panel, initialWidth, position: { direction: 'right' } })
}
