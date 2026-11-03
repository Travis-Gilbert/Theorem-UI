// SOURCING: dockview-react (the Vault's docking layout: tabs, splits, floating
// groups, maximize, serialization, always-rendered panels), as the shell's
// DockShell uses it; WorkspaceFileDockPanel (the handler registry's Panel, so
// notes open in Milkdown Crepe); the Vault's own panels and status bar; zustand
// stores for the layout, the followed file and the rail's per-mode panel state.
import { DockviewDefaultTab, DockviewReact } from 'dockview-react'
import type {
  AddPanelPositionOptions,
  DockviewApi,
  DockviewReadyEvent,
  DockviewTheme,
  IDockviewPanel,
  IDockviewPanelHeaderProps,
} from 'dockview-react'
import { basename } from 'pathe'
import { useEffect, useRef, useState } from 'react'
import { useShell } from '@/components/shell/shell-state'
import {
  WORKSPACE_FILE_COMPONENT,
  WorkspaceFileDockPanel,
} from '@/components/workspace/workspace-file-panel'
import {
  useWorkspaceFileView,
  workspaceFilePanelId,
} from '@/lib/workspace/open'
import type { WorkspaceFileRef } from '@/lib/workspace/open'
import { GraphPanel } from './vault-graph'
import {
  FilesPanel,
  LinksPanel,
  OutlinePanel,
  StartPanel,
} from './vault-panels'
import { VAULT_TOOLS, useVaultFile, useVaultPrefs } from './vault-state'
import type { VaultTool } from './vault-state'
import { VaultStatusBar } from './vault-status-bar'

/** The editor's tab while no file is open. */
const START = 'start'

const theme: DockviewTheme = {
  name: 'stone',
  className: 'dockview-theme-stone',
}

const components = {
  [START]: StartPanel,
  files: FilesPanel,
  outline: OutlinePanel,
  links: LinksPanel,
  graph: GraphPanel,
  [WORKSPACE_FILE_COMPONENT]: WorkspaceFileDockPanel,
}

const tabComponents = {
  /** The empty tab comes back whenever the last file closes, so it has no close. */
  fixed: (props: IDockviewPanelHeaderProps) => (
    <DockviewDefaultTab {...props} hideClose />
  ),
}

const fileOf = (panel: IDockviewPanel) =>
  panel.view.contentComponent === WORKSPACE_FILE_COMPONENT
    ? (panel.params as WorkspaceFileRef)
    : undefined

const filePanels = (api: DockviewApi) => api.panels.filter(fileOf)

/** The group files open in: the followed file's, else any file's, else the empty tab's. */
function editorGroup(api: DockviewApi) {
  const followed = useVaultFile.getState().file
  const panel =
    (followed && api.getPanel(workspaceFilePanelId(followed))) ??
    filePanels(api)[0] ??
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
function addTool(api: DockviewApi, id: VaultTool) {
  const options = { id, component: id, title: VAULT_TOOLS[id] }
  const first = (ids: Array<VaultTool>) =>
    ids.map((other) => api.getPanel(other)).find(Boolean)
  if (id === 'files') {
    api.addPanel({
      ...options,
      initialWidth: 260,
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
      initialWidth: 300,
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

function addStart(api: DockviewApi) {
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
      ? Math.max(320, api.width - Math.min(side, 320))
      : undefined,
  })
}

/** The first image's arrangement: files, the document, its outline and links over the graph. */
function buildDefaultLayout(api: DockviewApi) {
  addStart(api)
  for (const tool of Object.keys(VAULT_TOOLS) as Array<VaultTool>)
    addTool(api, tool)
  // Columns added later squeeze the earlier ones, so the widths are set last.
  api.getPanel('files')?.group.api.setSize({ width: 260 })
  api.getPanel('outline')?.group.api.setSize({ width: 320 })
  api.getPanel('outline')?.api.setActive()
  api.getPanel(START)?.api.setActive()
}

/** A file joins the editor's tabs and replaces the empty tab. */
function openFile(api: DockviewApi, file: WorkspaceFileRef, replacing?: string) {
  const id = workspaceFilePanelId(file)
  const existing = api.getPanel(id)
  const old =
    replacing === undefined
      ? undefined
      : api.getPanel(workspaceFilePanelId({ ...file, path: replacing }))
  if (existing) {
    if (file.handler) existing.api.updateParameters(file)
    existing.api.setActive()
    old?.api.close()
    return
  }
  api.addPanel({
    id,
    component: WORKSPACE_FILE_COMPONENT,
    params: file,
    title: basename(file.path),
    minimumWidth: 320,
    // A file that took another's place opens in its tab.
    position: old
      ? { referencePanel: old.id, direction: 'within' }
      : editorPosition(api),
  })
  old?.api.close()
  const start = api.getPanel(START)
  if (start) api.removePanel(start)
}

/** Follows the active file tab, else the first one open. */
function followFile(api: DockviewApi) {
  const active = api.activePanel && fileOf(api.activePanel)
  useVaultFile.setState({
    file: active ?? filePanels(api).map(fileOf)[0],
  })
}

/**
 * The Vault: an Obsidian-style workspace over the opened folders. Every part
 * is a dock panel the person can move, stack, float or close, and the
 * arrangement is kept. The rail's Vault button shows and hides Files; the
 * status bar brings back any panel and resets the layout.
 */
export function VaultWorkspace({ active }: { active: boolean }) {
  const [dock, setDock] = useState<DockviewApi>()
  const filesOpen = useShell((s) => !s.panelCollapsed.vault)
  /** Set while the layout is replaced, when its events are not the person's. */
  const replacing = useRef(false)

  const arrange = (api: DockviewApi, build: () => void) => {
    replacing.current = true
    try {
      build()
      if (!filePanels(api).length && !api.getPanel(START)) addStart(api)
    } finally {
      replacing.current = false
    }
    useVaultPrefs.getState().saveLayout(api.toJSON())
    followFile(api)
  }

  const onReady = ({ api }: DockviewReadyEvent) => {
    const saved = useVaultPrefs.getState().layout
    arrange(api, () => {
      if (saved)
        try {
          api.fromJSON(saved)
          return
        } catch {
          api.clear()
        }
      buildDefaultLayout(api)
    })
    setDock(api)
  }

  const reset = () => {
    if (!dock) return
    arrange(dock, () => {
      dock.clear()
      buildDefaultLayout(dock)
    })
    if (useShell.getState().panelCollapsed.vault)
      useShell.getState().togglePanel('vault')
  }

  const toggleTool = (id: VaultTool) => {
    if (!dock) return
    const panel = dock.getPanel(id)
    if (panel) dock.removePanel(panel)
    else addTool(dock, id)
  }

  useEffect(() => {
    if (!dock) return
    // The rail's state follows Files however it was closed or brought back.
    const railShows = (open: boolean) => {
      if (useShell.getState().panelCollapsed.vault === open)
        useShell.getState().togglePanel('vault')
    }
    // Only the editor gives or takes the space when a column comes or goes, as
    // in Obsidian, rather than every column sharing it: widths are taken before
    // the change and the other columns get theirs back after it.
    const widths = new Map<string, number>()
    const listeners = [
      dock.onDidActivePanelChange(({ panel }) => {
        const file = panel && fileOf(panel)
        if (file) useVaultFile.setState({ file })
      }),
      dock.onDidAddPanel((panel) => {
        if (!replacing.current && panel.id === 'files') railShows(true)
      }),
      dock.onDidRemovePanel((panel) => {
        if (replacing.current) return
        if (panel.id === 'files') railShows(false)
        const followed = useVaultFile.getState().file
        if (followed && panel.id === workspaceFilePanelId(followed))
          followFile(dock)
        // The editor keeps its place: the last file to close leaves the empty tab.
        queueMicrotask(() => {
          if (!filePanels(dock).length && !dock.getPanel(START)) addStart(dock)
        })
      }),
      dock.onWillMutateLayout(({ kind }) => {
        if (kind !== 'add' && kind !== 'remove') return
        widths.clear()
        for (const group of dock.groups) widths.set(group.id, group.api.width)
      }),
      dock.onDidMutateLayout(({ kind }) => {
        if ((kind !== 'add' && kind !== 'remove') || replacing.current) return
        const editor = editorGroup(dock)
        for (const group of dock.groups) {
          const width = widths.get(group.id)
          if (group !== editor && width) group.api.setSize({ width })
        }
      }),
      dock.onDidLayoutChange(() => {
        if (!replacing.current)
          useVaultPrefs.getState().saveLayout(dock.toJSON())
      }),
    ]
    return () => {
      for (const listener of listeners) listener.dispose()
    }
  }, [dock])

  // The rail's Vault button shows and hides Files.
  useEffect(() => {
    if (!dock) return
    const files = dock.getPanel('files')
    if (filesOpen && !files) addTool(dock, 'files')
    else if (!filesOpen && files) dock.removePanel(files)
  }, [dock, filesOpen])

  // While the Vault shows, files open in it.
  useEffect(() => {
    if (!dock || !active) return
    useWorkspaceFileView.setState({
      vault: { open: (file, from) => openFile(dock, file, from) },
    })
    return () => useWorkspaceFileView.setState({ vault: undefined })
  }, [dock, active])

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <DockviewReact
          className="h-full w-full"
          theme={theme}
          components={components}
          tabComponents={tabComponents}
          defaultRenderer="always"
          getTabContextMenuItems={({ panel, api }) => {
            const float = {
              label: 'Float',
              action: () =>
                api.addFloatingGroup(panel, { width: 420, height: 520 }),
            }
            return panel.id === START
              ? ['maximize']
              : ['maximize', float, 'separator', 'close']
          }}
          onReady={onReady}
        />
      </div>
      <VaultStatusBar dock={dock} onToggle={toggleTool} onReset={reset} />
    </div>
  )
}
