// SOURCING: dockview-react (the Vault's docking layout: tabs, splits, floating
// groups, maximize, serialization, always-rendered panels), as the shell's
// DockShell uses it; WorkspaceFileDockPanel (the handler registry's Panel, so
// notes open in Milkdown Crepe) inside the DocumentScreen context; the
// inspector's Outline, Links and Graph panels over the Vault's own followed
// file (InspectedFileStore); the Vault's layout rules (vault-layout.ts), Files
// and empty tab panels and status bar; zustand stores for the layout, the
// followed file and the rail's per-mode panel state.
import { DockviewDefaultTab, DockviewReact } from 'dockview-react'
import type {
  DockviewApi,
  DockviewReadyEvent,
  DockviewTheme,
  IDockviewPanelHeaderProps,
  IDockviewPanelProps,
} from 'dockview-react'
import { useEffect, useRef, useState } from 'react'
import { GraphPanel } from '@/components/inspector/graph-panel'
import {
  LinksPanel,
  OutlinePanel,
} from '@/components/inspector/inspector-panels'
import { InspectedFileStore } from '@/components/inspector/inspector-state'
import { followFront } from '@/components/shell/arrangements'
import { useShell } from '@/components/shell/shell-state'
import {
  WORKSPACE_FILE_COMPONENT,
  WorkspaceFileDockPanel,
} from '@/components/workspace/workspace-file-panel'
import { useWorkspaceFileView } from '@/lib/workspace/open'
import type { WorkspaceFileRef } from '@/lib/workspace/open'
import { DocumentScreen } from './document-screen'
import {
  START,
  addTool,
  buildDefaultLayout,
  filePanels,
  keepEditorPlace,
  keepSideWidths,
  openVaultFile,
} from './vault-layout'
import { FilesPanel, StartPanel } from './vault-panels'
import { useVaultFile, useVaultLayout } from './vault-state'
import type { VaultTool } from './vault-state'
import { VaultStatusBar } from './vault-status-bar'

/** The dock's theme, whose colours come from the palette tokens. */
const theme: DockviewTheme = {
  name: 'theorem',
  className: 'dockview-theme-theorem',
}

/** A note in the Vault is on the document screen, where it can be asked about. */
function VaultFilePanel(props: IDockviewPanelProps<WorkspaceFileRef>) {
  return (
    <DocumentScreen value={true}>
      <WorkspaceFileDockPanel {...props} />
    </DocumentScreen>
  )
}

const components = {
  [START]: StartPanel,
  files: FilesPanel,
  outline: OutlinePanel,
  links: LinksPanel,
  graph: GraphPanel,
  [WORKSPACE_FILE_COMPONENT]: VaultFilePanel,
}

const tabComponents = {
  /** The empty tab comes back whenever the last file closes, so it has no close. */
  fixed: (props: IDockviewPanelHeaderProps) => (
    <DockviewDefaultTab {...props} hideClose />
  ),
}

/**
 * The Vault: an Obsidian-style workspace over Home and the opened folders,
 * where a note is read and asked about. Every part is a dock panel the person
 * can move, stack, float or close, and the arrangement is kept. The rail's
 * Vault button shows and hides Files; the status bar brings back any panel and
 * resets the layout. Its outline, links, graph and status bar follow its own
 * front file (useVaultFile), apart from the dock's inspector, so leaving the
 * Vault finds the conversation's inspector where it was.
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
      keepEditorPlace(api)
    } finally {
      replacing.current = false
    }
    useVaultLayout.getState().saveLayout(api.toJSON())
  }

  const onReady = ({ api }: DockviewReadyEvent) => {
    const saved = useVaultLayout.getState().layout
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
    const listeners = [
      dock.onDidAddPanel((panel) => {
        if (!replacing.current && panel.id === 'files') railShows(true)
      }),
      dock.onDidRemovePanel((panel) => {
        if (replacing.current) return
        if (panel.id === 'files') railShows(false)
        // The editor keeps its place: the last file to close leaves the empty tab.
        queueMicrotask(() => keepEditorPlace(dock))
      }),
      dock.onDidLayoutChange(() => {
        if (!replacing.current)
          useVaultLayout.getState().saveLayout(dock.toJSON())
      }),
      { dispose: keepSideWidths(dock, () => replacing.current) },
      { dispose: followFront(dock, useVaultFile) },
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
      vault: { open: (file, from) => openVaultFile(dock, file, from) },
    })
    return () => useWorkspaceFileView.setState({ vault: undefined })
  }, [dock, active])

  return (
    <InspectedFileStore value={useVaultFile}>
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
              return panel.id === START || !filePanels(api).includes(panel)
                ? ['maximize']
                : ['maximize', float, 'separator', 'close']
            }}
            onReady={onReady}
          />
        </div>
        <VaultStatusBar dock={dock} onToggle={toggleTool} onReset={reset} />
      </div>
    </InspectedFileStore>
  )
}
