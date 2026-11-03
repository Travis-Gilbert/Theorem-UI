// SOURCING: dockview-core's DockviewApi (addPanel positions, group sizes, the
// layout mutation events), as arrangements.ts places the dock's panels, and
// openWorkspaceFilePanel for a file's tab. Dockview has no placement policy
// for an Obsidian-style vault, so the rules below are the app's own.
import type {
  AddPanelPositionOptions,
  DockviewApi,
  IDockviewPanel,
} from 'dockview-core'
import { basename } from 'pathe'
import { fileOf } from '@/components/shell/arrangements'
import {
  WORKSPACE_FILE_COMPONENT,
  openWorkspaceFilePanel,
} from '@/components/workspace/workspace-file-panel'
import { sameFile, workspaceFilePanelId } from '@/lib/workspace/open'
import type { WorkspaceFileRef } from '@/lib/workspace/open'
import { VAULT_TOOLS, useVaultFile } from './vault-state'
import type { VaultTool } from './vault-state'

/** The editor's tab while no file is open. */
export const START = 'start'

/** The side columns' widths in the default layout, as Obsidian's. */
const FILES_WIDTH = 260
const SIDE_WIDTH = 320

export const filePanels = (api: DockviewApi) =>
  api.panels.filter((panel) => fileOf(panel))

/** The group files open in: the followed file's, else any file's, else the empty tab's. */
export function editorGroup(api: DockviewApi) {
  const followed = useVaultFile.getState().file
  const files = filePanels(api)
  const panel: IDockviewPanel | undefined =
    (followed && files.find((p) => sameFile(fileOf(p)!, followed))) ??
    files[0] ??
    api.getPanel(START)
  return panel?.group
}

/**
 * Where the editor goes: its group, else right of the files, else a full-height
 * column at the left edge (left of one side panel would only split its row).
 */
function editorPosition(api: DockviewApi): AddPanelPositionOptions | undefined {
  const group = editorGroup(api)
  if (group) return { referenceGroup: group }
  const files = api.getPanel('files')
  if (files) return { referencePanel: files, direction: 'right' }
  return api.panels.length ? { direction: 'left' } : undefined
}

/**
 * Brings back a closed tool where the default layout has it: Files at the
 * left edge, Outline and Links as tabs at the right, the graph below them.
 */
export function addTool(api: DockviewApi, id: VaultTool) {
  const options = { id, component: id, title: VAULT_TOOLS[id] }
  const first = (ids: Array<VaultTool>) =>
    ids.map((other) => api.getPanel(other)).find(Boolean)
  if (id === 'files') {
    api.addPanel({
      ...options,
      initialWidth: FILES_WIDTH,
      position: { direction: 'left' },
    })
    return
  }
  const tabs = first(
    id === 'graph' ? ['outline', 'links'] : ['outline', 'links', 'graph'],
  )
  if (!tabs)
    api.addPanel({
      ...options,
      initialWidth: SIDE_WIDTH,
      position: { direction: 'right' },
    })
  else if (id === 'graph')
    api.addPanel({
      ...options,
      position: { referenceGroup: tabs.group, direction: 'below' },
    })
  else if (tabs.id === 'graph')
    api.addPanel({
      ...options,
      position: { referenceGroup: tabs.group, direction: 'above' },
    })
  else api.addPanel({ ...options, position: { referenceGroup: tabs.group } })
}

export function addStart(api: DockviewApi) {
  const position = editorPosition(api)
  // A new left column leaves the side panels their width (at most the default
  // 320, since with no editor they have spread across the dock), not half.
  const edge =
    position && !('referenceGroup' in position || 'referencePanel' in position)
  const side = edge
    ? api.groups.reduce((width, group) => Math.max(width, group.api.width), 0)
    : 0
  api.addPanel({
    id: START,
    component: START,
    tabComponent: 'fixed',
    title: 'New tab',
    position,
    initialWidth: edge
      ? Math.max(SIDE_WIDTH, api.width - Math.min(side, SIDE_WIDTH))
      : undefined,
  })
}

/** Obsidian's arrangement: files, the document, its outline and links over the graph. */
export function buildDefaultLayout(api: DockviewApi) {
  addStart(api)
  for (const tool of Object.keys(VAULT_TOOLS) as Array<VaultTool>)
    addTool(api, tool)
  // Columns added later squeeze the earlier ones, so the widths are set last.
  api.getPanel('files')?.group.api.setSize({ width: FILES_WIDTH })
  api.getPanel('outline')?.group.api.setSize({ width: SIDE_WIDTH })
  api.getPanel('outline')?.api.setActive()
  api.getPanel(START)?.api.setActive()
}

/**
 * A file joins the editor's tabs; the first one takes the empty tab's place.
 * A file `replacing` an open one's path opens in its tab, as in the dock.
 */
export function openVaultFile(
  api: DockviewApi,
  file: WorkspaceFileRef,
  replacing?: string,
) {
  if (filePanels(api).length) {
    openWorkspaceFilePanel(api, file, START, replacing)
    return
  }
  const start = api.getPanel(START)
  api.addPanel({
    id: workspaceFilePanelId(file),
    component: WORKSPACE_FILE_COMPONENT,
    params: file,
    title: basename(file.path),
    minimumWidth: 360,
    position: editorPosition(api),
  })
  if (start) api.removePanel(start)
}

/** The editor keeps its place: with no file open, the empty tab holds it. */
export function keepEditorPlace(api: DockviewApi) {
  if (!filePanels(api).length && !api.getPanel(START)) addStart(api)
}

/**
 * Only the editor gives or takes the space when a column comes or goes, as
 * in Obsidian, rather than every column sharing it: widths are taken before
 * the change and the other columns get theirs back after it. Nothing is kept
 * while `paused` says the layout is being replaced. Returns the function that
 * stops it.
 */
export function keepSideWidths(api: DockviewApi, paused = () => false) {
  const widths = new Map<string, number>()
  const listeners = [
    api.onWillMutateLayout(({ kind }) => {
      if (kind !== 'add' && kind !== 'remove') return
      widths.clear()
      for (const group of api.groups) widths.set(group.id, group.api.width)
    }),
    api.onDidMutateLayout(({ kind }) => {
      if ((kind !== 'add' && kind !== 'remove') || paused()) return
      const editor = editorGroup(api)
      for (const group of api.groups) {
        const width = widths.get(group.id)
        if (group !== editor && width) group.api.setSize({ width })
      }
    }),
  ]
  return () => {
    for (const listener of listeners) listener.dispose()
  }
}
