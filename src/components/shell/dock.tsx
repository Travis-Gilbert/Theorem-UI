// SOURCING: dockview-react (docking layout: tabs, splits, floating groups, maximize, serialization, always-rendered panels), the shell's ModeView (assistant-ui Thread in chat mode), FilePanel, Base UI Menu (the panels menu that opens the terminal drawers), zustand stores for artifact view, saved layouts and the drawers
import { useAuiState } from '@assistant-ui/react'
import { Menu } from '@base-ui/react/menu'
import { DockviewDefaultTab, DockviewReact } from 'dockview-react'
import type {
  DockviewApi,
  DockviewReadyEvent,
  DockviewTheme,
  IDockviewHeaderActionsProps,
  IDockviewPanelHeaderProps,
  IDockviewPanelProps,
} from 'dockview-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArtifactPanel } from '@/components/artifacts/artifact-panel'
import { useThreadArtifacts } from '@/components/artifacts/artifact-model'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useFileDock } from '@/lib/theorem/project-files'
import { FilePanel } from './file-panel'
import { ModeView, modeLabel, useShellMode } from './modes'
import { useShell } from './shell-state'
import { menuItem, menuPopup } from './sidebar'

import { flyGhost, popIn } from '@/lib/motion'

const THREAD = 'thread'
const ARTIFACT = 'artifact:'

const artifactPanelId = (artifactId: string) => `${ARTIFACT}${artifactId}`
const artifactIdOf = (panelId: string) =>
  panelId.startsWith(ARTIFACT) ? panelId.slice(ARTIFACT.length) : undefined
const FILE = 'file:'
const filePanelId = (path: string) => `${FILE}${path}`
const isFilePanel = (panelId: string) => panelId.startsWith(FILE)

/** Colours come from the palette tokens, which already switch per palette and mode. */
const theme: DockviewTheme = {
  name: 'theorem',
  className: 'dockview-theme-theorem',
}

/** Subscribes React to a dockview event; dockview events return a disposable. */
function subscribe(event: (listener: () => void) => { dispose: () => void }) {
  return (onChange: () => void) => {
    const disposable = event(onChange)
    return () => disposable.dispose()
  }
}

/** The main panel: the conversation in chat mode, the mode's view otherwise. */
function ThreadPanel({ api }: IDockviewPanelProps) {
  const title = useAuiState((s) => s.threadListItem.title)
  const mode = useShellMode()
  useEffect(
    () => api.setTitle(mode === 'chat' ? title || 'New chat' : modeLabel(mode)),
    [api, mode, title],
  )
  return (
    <div className="h-full">
      <ModeView />
    </div>
  )
}

function ArtifactDockPanel({
  api,
  containerApi,
  params,
}: IDockviewPanelProps<{ artifactId: string }>) {
  const { artifactId } = params
  const versions = useThreadArtifacts().get(artifactId)
  const title = versions?.at(-1)?.title
  useEffect(() => {
    if (title) api.setTitle(title)
  }, [api, title])
  const expanded = useSyncExternalStore(
    subscribe(containerApi.onDidMaximizedGroupChange),
    () => api.isMaximized(),
  )
  const loading = useAuiState((s) => s.thread.isLoading)

  if (!versions?.length)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-artifact px-6 text-center text-sm text-ink-muted">
        {loading ? (
          <p>Loading artifact…</p>
        ) : (
          <>
            <p>This artifact is not part of this conversation.</p>
            <Button variant="ghost" size="sm" onClick={() => api.close()}>
              Close
            </Button>
          </>
        )}
      </div>
    )

  return (
    <ArtifactPanel
      artifactId={artifactId}
      onClose={() => api.close()}
      expanded={expanded}
      onExpandedChange={(next) => (next ? api.maximize() : api.exitMaximized())}
    />
  )
}

function FileDockPanel({
  api,
  params,
}: IDockviewPanelProps<{ projectId: string; path: string }>) {
  useEffect(() => {
    api.setTitle(params.path.split('/').at(-1) || params.path)
  }, [api, params.path])
  return <FilePanel projectId={params.projectId} path={params.path} />
}

const components = {
  thread: ThreadPanel,
  artifact: ArtifactDockPanel,
  file: FileDockPanel,
}

const tabComponents = {
  /** The thread is always present, so its tab has no close button. */
  fixed: (props: IDockviewPanelHeaderProps) => (
    <DockviewDefaultTab {...props} hideClose />
  ),
}

/**
 * Opens a drawer beside the conversation: the terminal, on the right or at
 * the bottom, and later other tools. New chat lives in the sidebar.
 */
function GroupActions({ panels }: IDockviewHeaderActionsProps) {
  if (!panels.some((panel) => panel.id === THREAD)) return null
  return (
    <div className="flex h-full items-center pe-1">
      <Menu.Root>
        <Menu.Trigger
          render={
            <TooltipIconButton
              tooltip="Open a panel"
              className="size-7 p-1.5"
            />
          }
        >
          <Icon.Panels className="size-4" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={6} className="z-50">
            <Menu.Popup className={`min-w-52 ${menuPopup}`}>
              <Menu.Item
                className={menuItem}
                onClick={() => useShell.getState().setSideDrawer('terminal')}
              >
                <Icon.Terminal className="size-4 text-ink-muted" />
                Terminal on the right
              </Menu.Item>
              <Menu.Item
                className={menuItem}
                onClick={() => useShell.getState().setTerminalOpen(true)}
              >
                <Icon.Terminal className="size-4 text-ink-muted" />
                Terminal at the bottom
                <span className="ms-auto ps-4 font-mono text-xs text-ink-faint">
                  ctrl+`
                </span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  )
}

function buildDefaultLayout(api: DockviewApi) {
  api.addPanel({
    id: THREAD,
    component: 'thread',
    tabComponent: 'fixed',
    title: 'New chat',
    minimumWidth: 360,
  })
}

/** Restores a saved layout, or reports that it is unusable. */
function restoreLayout(
  api: DockviewApi,
  dock: Parameters<DockviewApi['fromJSON']>[0],
) {
  try {
    api.fromJSON(dock)
  } catch {
    api.clear()
    return false
  }
  if (api.getPanel(THREAD)) return true
  api.clear()
  return false
}

/**
 * New artifacts and files join the existing side tabs, else open beside the
 * conversation.
 */
function openSide(
  api: DockviewApi,
  options: {
    id: string
    component: string
    params: Record<string, string>
    title: string
  },
) {
  const existing = api.getPanel(options.id)
  if (existing) {
    existing.api.setActive()
    return
  }
  const sibling = api.panels.find(
    (panel) => artifactIdOf(panel.id) || isFilePanel(panel.id),
  )
  if (sibling) {
    api.addPanel({
      ...options,
      minimumWidth: 400,
      position: { referenceGroup: sibling.group },
    })
    return
  }
  const initialWidth = Math.round(api.width * 0.55)
  const sized = { ...options, minimumWidth: 400, initialWidth }
  if (api.getPanel(THREAD)?.api.location.type === 'grid')
    api.addPanel({
      ...sized,
      position: { referencePanel: THREAD, direction: 'right' },
    })
  else api.addPanel({ ...sized, position: { direction: 'right' } })
}

function openArtifact(api: DockviewApi, artifactId: string) {
  openSide(api, {
    id: artifactPanelId(artifactId),
    component: 'artifact',
    params: { artifactId },
    title: 'Artifact',
  })
}

/** Files belong to the project, so they stay open across conversations. */
function openFile(api: DockviewApi, projectId: string, path: string) {
  openSide(api, {
    id: filePanelId(path),
    component: 'file',
    params: { projectId, path },
    title: path.split('/').at(-1) || path,
  })
}

/**
 * Maximize and restore move groups on springs: a group that changes size
 * grows or shrinks there as a ghost of its surface, and groups that come back
 * into view pop in. dockview brackets the change, so the rects before it are
 * still on screen when the first event fires.
 */
function springMaximize(dock: DockviewApi) {
  let before = new Map<string, DOMRect>()
  return [
    dock.onWillMutateLayout(({ kind }) => {
      if (kind !== 'maximize') return
      before = new Map(
        dock.groups.map((group) => [
          group.id,
          group.element.getBoundingClientRect(),
        ]),
      )
    }),
    dock.onDidMutateLayout(({ kind }) => {
      if (kind !== 'maximize') return
      const was = before
      requestAnimationFrame(() => {
        for (const group of dock.groups) {
          const from = was.get(group.id)
          const to = group.element.getBoundingClientRect()
          if (!from || to.width === 0 || to.height === 0) continue
          if (from.width === 0 || from.height === 0) {
            popIn(group.element, { from: 0.97, ease: 'settle' })
            continue
          }
          if (from.width === to.width && from.height === to.height) continue
          const artifact = group.panels.some(
            (panel) => artifactIdOf(panel.id) || isFilePanel(panel.id),
          )
          flyGhost(from, group.element, {
            className: artifact ? 'bg-artifact' : 'bg-background',
            ease: 'settle',
          })
        }
      })
    }),
  ]
}
/**
 * Desktop dock: the conversation, each open artifact and each open project file as dock panels. Panels render always, so moving or hiding one
 * keeps its React state, scroll position and focus target. The layout is saved
 * per project; artifact panels belong to the conversation they came from.
 */
export function DockShell({
  projectId,
  threadId,
}: {
  projectId: string
  /** Routed conversation; undefined for a new chat that has not been saved yet. */
  threadId: string | undefined
}) {
  const [dock, setDock] = useState<DockviewApi>()
  /** Conversation the layout's artifact panels belong to. */
  const layoutThread = useRef<string | undefined>(undefined)

  const onReady = ({ api }: DockviewReadyEvent) => {
    const saved = useShell.getState().layouts[projectId]
    if (saved && restoreLayout(api, saved.dock))
      layoutThread.current = saved.threadId
    else buildDefaultLayout(api)
    setDock(api)
  }

  // Connects the artifact store to this dock and saves every layout change.
  useEffect(() => {
    if (!dock) return
    const save = () =>
      useShell.getState().saveLayout(projectId, {
        threadId: layoutThread.current,
        dock: dock.toJSON(),
      })
    const active = dock.activePanel && artifactIdOf(dock.activePanel.id)
    if (active) useArtifactView.getState().focused(active)
    useArtifactView.setState({
      dock: {
        open: (artifactId) => openArtifact(dock, artifactId),
        expand: (artifactId) => {
          openArtifact(dock, artifactId)
          dock.getPanel(artifactPanelId(artifactId))?.api.maximize()
        },
        close: (artifactId) => {
          const panel = dock.getPanel(artifactPanelId(artifactId))
          if (panel) dock.removePanel(panel)
          else useArtifactView.getState().closed(artifactId)
        },
      },
    })
    useFileDock.setState({ open: (path) => openFile(dock, projectId, path) })
    const listeners = [
      dock.onDidActivePanelChange(({ panel }) => {
        const artifactId = panel && artifactIdOf(panel.id)
        if (artifactId) useArtifactView.getState().focused(artifactId)
      }),
      dock.onDidRemovePanel((panel) => {
        const artifactId = artifactIdOf(panel.id)
        if (artifactId) useArtifactView.getState().closed(artifactId)
      }),
      dock.onDidLayoutChange(save),
      ...springMaximize(dock),
    ]
    return () => {
      for (const listener of listeners) listener.dispose()
      useArtifactView.setState({ dock: undefined })
      useFileDock.setState({ open: undefined })
    }
  }, [dock, projectId])

  // A different conversation starts without the previous one's artifacts. A
  // new chat gaining its first id is the same conversation, so it keeps them.
  useEffect(() => {
    if (!dock || layoutThread.current === threadId) return
    const previous = layoutThread.current
    layoutThread.current = threadId
    if (previous !== undefined) {
      for (const panel of dock.panels)
        if (artifactIdOf(panel.id)) dock.removePanel(panel)
      useArtifactView.getState().reset()
    }
    useShell.getState().saveLayout(projectId, {
      threadId,
      dock: dock.toJSON(),
    })
  }, [dock, threadId, projectId])

  return (
    <DockviewReact
      className="h-full w-full"
      theme={theme}
      components={components}
      tabComponents={tabComponents}
      rightHeaderActionsComponent={GroupActions}
      defaultRenderer="always"
      getTabContextMenuItems={({ panel, api }) => {
        // The built-in float opens at 300px, narrower than these panels' minimums.
        const float = {
          label: 'Float',
          action: () =>
            api.addFloatingGroup(panel, { width: 480, height: 560 }),
        }
        return panel.id === THREAD
          ? ['maximize', float]
          : ['maximize', float, 'separator', 'close']
      }}
      onReady={onReady}
    />
  )
}
