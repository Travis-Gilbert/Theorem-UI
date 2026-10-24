// SOURCING: dockview-react (docking layout: tabs, splits, floating and edge groups, maximize, serialization, always-rendered panels), the shell's ModeView (assistant-ui Thread in chat mode), FilePanel, NotePanel (Milkdown Crepe), WorkspaceFilePanel, the IDE frame (browser-only Theia), Base UI Menu (the panels menu that opens the terminal drawers), zustand stores for artifact view, note view, workspace file view, saved layouts and the drawers
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
import { NotePanel } from '@/components/notes/note-panel'
import { useNoteView } from '@/components/notes/note-view'
import { Button } from '@/components/ui/button'
import {
  WORKSPACE_FILE_COMPONENT,
  WorkspaceFileDockPanel,
  openWorkspaceFilePanel,
} from '@/components/workspace/workspace-file-panel'
import { useNote } from '@/lib/theorem/notes'
import { useFileDock } from '@/lib/theorem/project-files'
import { useWorkspaceFileView } from '@/lib/workspace/open'
import { FilePanel } from './file-panel'
import { ModeView, modeLabel, useShellMode } from './modes'
import { openBeside } from './open-beside'
import { useShell } from './shell-state'
import { menuItem, menuPopup } from './sidebar'

import { useFollow } from '@/components/ide/follow'
import { IdeFrame } from '@/components/ide/ide-frame'
import { flyGhost, popIn } from '@/lib/motion'
import { cn } from '@/lib/utils'

const THREAD = 'thread'
const ARTIFACT = 'artifact:'
const NOTE = 'note-panel:'

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

/** The main panel: the conversation, or the mode's view in Spaces. Theia covers the dock in IDE mode. */
function ThreadPanel({ api }: IDockviewPanelProps) {
  const title = useAuiState((s) => s.threadListItem.title)
  const mode = useShellMode()
  useEffect(
    () =>
      api.setTitle(mode === 'spaces' ? modeLabel(mode) : title || 'New chat'),
    [api, mode, title],
  )
  return (
    <div className="h-full">
      <ModeView docked />
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

/** A focused note. Notes belong to the project, so they stay across conversations. */
function NoteDockPanel({
  api,
  params,
}: IDockviewPanelProps<{ documentId: string }>) {
  const title = useNote(params.documentId).data?.title
  useEffect(() => {
    if (title) api.setTitle(title)
  }, [api, title])
  return <NotePanel documentId={params.documentId} />
}

const components = {
  thread: ThreadPanel,
  // Layouts saved while the IDE was a dock panel name it; restoreLayout drops it.
  ide: IdeFrame,
  artifact: ArtifactDockPanel,
  note: NoteDockPanel,
  [WORKSPACE_FILE_COMPONENT]: WorkspaceFileDockPanel,
  file: FileDockPanel,
}

const tabComponents = {
  /** The thread is always present, so its tab has no close button. */
  fixed: (props: IDockviewPanelHeaderProps) => (
    <DockviewDefaultTab {...props} hideClose />
  ),
}

/** Follow the Agent across the dock: files in the IDE, artifacts in their panels. */
function FollowToggle() {
  const following = useFollow((s) => s.following)
  const { pause, resume } = useFollow.getState()
  return (
    <TooltipIconButton
      tooltip={following ? 'Following the agent' : 'Follow the agent'}
      aria-pressed={following}
      onClick={following ? pause : resume}
      className={cn('size-7 p-1.5', !following && 'text-ink-faint')}
    >
      <Icon.Eye className="size-4" />
    </TooltipIconButton>
  )
}
/**
 * Opens a drawer beside the conversation: the terminal, on the right or at
 * the bottom, and later other tools. New chat lives in the sidebar.
 */
function GroupActions({ panels }: IDockviewHeaderActionsProps) {
  if (!panels.some((panel) => panel.id === THREAD)) return null
  return (
    <div className="flex h-full items-center pe-1">
      <FollowToggle />
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
  // Theia now covers the sheet in IDE mode, so an IDE panel would load it twice.
  const ide = api.getPanel('ide')
  if (ide) api.removePanel(ide)
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
  const sized = { ...options, minimumWidth: 400 }
  const sibling = api.panels.find(
    (panel) => artifactIdOf(panel.id) || isFilePanel(panel.id),
  )
  if (sibling) {
    api.addPanel({ ...sized, position: { referenceGroup: sibling.group } })
    return
  }
  openBeside(api, sized, THREAD, 0.55)
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
          // Every panel beside the conversation draws on the artifact surface.
          const side = group.panels.some((panel) => panel.id !== THREAD)
          flyGhost(from, group.element, {
            className: side ? 'bg-artifact' : 'bg-background',
            ease: 'settle',
          })
        }
      })
    }),
  ]
}

/** Notes join the open note tabs, else open beside the conversation. */
function openNote(api: DockviewApi, documentId: string) {
  const id = `${NOTE}${documentId}`
  const existing = api.getPanel(id)
  if (existing) {
    existing.api.setActive()
    return
  }
  const options = {
    id,
    component: 'note',
    params: { documentId },
    title: 'Note',
    minimumWidth: 360,
  }
  const sibling = api.panels.find((panel) => panel.id.startsWith(NOTE))
  if (sibling) {
    api.addPanel({ ...options, position: { referenceGroup: sibling.group } })
    return
  }
  openBeside(api, options, THREAD, 0.4)
}

/**
 * Desktop dock: the conversation and each open artifact, note and file as dock panels. Panels render always, so moving or hiding one
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
    useNoteView.setState({
      dock: { open: (documentId) => openNote(dock, documentId) },
    })
    useWorkspaceFileView.setState({
      dock: { open: (file) => openWorkspaceFilePanel(dock, file, THREAD) },
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
      useNoteView.setState({ dock: undefined })
      useWorkspaceFileView.setState({ dock: undefined })
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
