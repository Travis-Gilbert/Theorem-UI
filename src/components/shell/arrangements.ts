// SOURCING: dockview's DockviewApi (groups, panel moves, maximize). An
// arrangement only places the dock's own panels; no library models these
// three, so they are hand-rolled over it.
import type {
  DockviewApi,
  DockviewGroupPanel,
  IDockviewPanel,
} from 'dockview-core'
import {
  INSPECTOR_TOOLS,
  useInspectedFile,
} from '@/components/inspector/inspector-state'
import type { InspectorTool } from '@/components/inspector/inspector-state'
import { WORKSPACE_FILE_COMPONENT } from '@/components/workspace/workspace-file-panel'
import { sameFile } from '@/lib/workspace/open'
import type { WorkspaceFileRef } from '@/lib/workspace/open'

/**
 * Ways to lay out one workspace. Choosing one moves panels, never closes
 * them, so files, the conversation and unsaved edits stay as they are.
 */
export const ARRANGEMENTS = {
  focus: 'Focus',
  together: 'Work together',
  explore: 'Explore',
} as const
export type Arrangement = keyof typeof ARRANGEMENTS

/** What the arrangement asks of the navigator beside the dock. */
export type NavigatorChange = { navigator: 'closed' | 'open' | 'files' }

/** The conversation's panel id in the dock. */
export const THREAD = 'thread'

const isFile = (panel: IDockviewPanel) =>
  panel.view.contentComponent === WORKSPACE_FILE_COMPONENT

const inGrid = (panel: IDockviewPanel) =>
  panel.group.api.location.type === 'grid'

/** The file a panel shows, as its parameters have it now. */
export const fileOf = (panel: {
  view: { contentComponent: string }
  params?: unknown
}) =>
  panel.view.contentComponent === WORKSPACE_FILE_COMPONENT
    ? (panel.params as WorkspaceFileRef)
    : undefined

/** The grid's group ids in reading order: left to right, top to bottom. */
function readingOrder(api: DockviewApi) {
  type Node = ReturnType<DockviewApi['toJSON']>['grid']['root']
  const ids = (node: Node): Array<string> =>
    Array.isArray(node.data) ? node.data.flatMap(ids) : [node.data.id]
  return ids(api.toJSON().grid.root)
}

/**
 * Whether `group` carries the panels menu: the conversation's group, or the
 * group Focus fills, which hides every other header and so the way back.
 */
export const holdsPanelsMenu = (group: DockviewGroupPanel) =>
  group.api.isMaximized() || group.panels.some((panel) => panel.id === THREAD)

/** The document in front: the active file, else the first one open. */
function frontFile(api: DockviewApi) {
  const active = api.activePanel
  return active && isFile(active) ? active : api.panels.find(isFile)
}

/**
 * Opens an inspector panel where the inspector sits: the outline and links
 * share a group at the right, and the graph goes below them.
 */
export function addInspector(api: DockviewApi, tool: InspectorTool) {
  if (api.getPanel(tool)) return
  const options = { id: tool, component: tool, title: INSPECTOR_TOOLS[tool] }
  const tabs = (['outline', 'links'] as const)
    .map((id) => api.getPanel(id))
    .find(Boolean)
  const graph = api.getPanel('graph')
  if (tool === 'graph')
    api.addPanel(
      tabs
        ? {
            ...options,
            position: { referenceGroup: tabs.group, direction: 'below' },
          }
        : { ...options, initialWidth: 300, position: { direction: 'right' } },
    )
  else if (tabs)
    api.addPanel({ ...options, position: { referenceGroup: tabs.group } })
  else if (graph)
    api.addPanel({
      ...options,
      position: { referenceGroup: graph.group, direction: 'above' },
    })
  else
    api.addPanel({
      ...options,
      initialWidth: 300,
      position: { direction: 'right' },
    })
}

/** The conversation at the left, the documents in a group right of it. */
function workTogether(api: DockviewApi) {
  const thread = api.getPanel(THREAD)
  if (!thread) return
  const files = api.panels.filter(isFile)
  const front = frontFile(api)
  if (!front) return
  // Files beside the conversation move out to it, in their tab order; with
  // none there and none in the grid, the one in front comes out of its float.
  const strays = files.filter((p) => p.group === thread.group)
  let documents = files.find(
    (p) => p.group !== thread.group && inGrid(p),
  )?.group
  if (!documents)
    documents = api.addGroup({
      referenceGroup: thread.group,
      direction: 'right',
    })
  const moving = strays.length ? strays : inGrid(front) ? [] : [front]
  for (const file of moving) file.api.moveTo({ group: documents })
  const order = readingOrder(api)
  if (order.indexOf(documents.id) < order.indexOf(thread.group.id))
    thread.api.moveTo({ group: documents, position: 'left' })
  front.api.setActive()
}

/** Lays the dock out as `arrangement`, and says what the navigator should do. */
export function arrange(
  api: DockviewApi,
  arrangement: Arrangement,
): NavigatorChange {
  if (api.hasMaximizedGroup()) api.exitMaximizedGroup()
  switch (arrangement) {
    case 'focus': {
      const target = frontFile(api) ?? api.getPanel(THREAD)
      target?.api.setActive()
      target?.api.maximize()
      return { navigator: 'closed' }
    }
    case 'together':
      workTogether(api)
      return { navigator: 'open' }
    case 'explore':
      addInspector(api, 'links')
      addInspector(api, 'graph')
      return { navigator: 'files' }
  }
}

/**
 * Keeps the inspector on the file in front: the active file tab, else the
 * one it already shows while that stays open, else the first file open. It
 * reads each panel's parameters as they change, so a file that learns its
 * entry or moves stays inspected. Returns the function that stops it.
 */
export function followFront(api: DockviewApi) {
  const inspect = () => {
    const files = api.panels.map(fileOf)
    const front = api.activePanel && fileOf(api.activePanel)
    const shown = useInspectedFile.getState().file
    const kept = shown && files.find((file) => file && sameFile(file, shown))
    useInspectedFile.setState({ file: front ?? kept ?? files.find(Boolean) })
  }
  const watched = new Map<string, { dispose: () => void }>()
  const watch = (panel: IDockviewPanel) =>
    watched.set(panel.id, panel.api.onDidParametersChange(inspect))
  api.panels.forEach(watch)
  inspect()
  const listeners = [
    api.onDidActivePanelChange(inspect),
    api.onDidAddPanel((panel) => {
      watch(panel)
      inspect()
    }),
    api.onDidRemovePanel((panel) => {
      watched.get(panel.id)?.dispose()
      watched.delete(panel.id)
      inspect()
    }),
  ]
  return () => {
    for (const listener of [...listeners, ...watched.values()])
      listener.dispose()
  }
}
