// SOURCING: dockview-react (docking layout: tabs, splits, floating and edge groups, maximize, serialization, always-rendered panels), the shell's ModeView (assistant-ui Thread in chat mode), FilePanel, NotePanel (Milkdown Crepe), WorkspaceFilePanel, the inspector's panels (the graph via React.lazy, so cosmos.gl loads only when it opens), the arrangements, the IDE frame (browser-only Theia), Base UI Menu (the panels menu: arrangements, the inspector, the terminal drawers), zustand stores for artifact view, note view, workspace file view, the inspected file, saved layouts and the drawers
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
import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { ArtifactPanel } from '@/components/artifacts/artifact-panel'
import { useThreadArtifacts } from '@/components/artifacts/artifact-model'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import {
  LinksPanel,
  OutlinePanel,
} from '@/components/inspector/inspector-panels'
import { INSPECTOR_TOOLS } from '@/components/inspector/inspector-state'
import type { InspectorTool } from '@/components/inspector/inspector-state'
import { NotePanel } from '@/components/notes/note-panel'
import { ThreadHeader } from '@/components/organize/thread-header'
import { useProjectHomeTitle } from '@/components/projects/project-home'
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
import {
  ARRANGEMENTS,
  THREAD,
  addInspector,
  arrange,
  followFront,
  holdsPanelsMenu,
} from './arrangements'
import type { Arrangement } from './arrangements'
import { FilePanel } from './file-panel'
import {
  hasOwnView,
  ModeView,
  modeLabel,
  navigatorMode,
  useShellMode,
} from './modes'
import type { ShellMode } from './modes'
import { openBeside } from './open-beside'
import { useShell } from './shell-state'
import { menuItem, menuPopup } from './sidebar'
import { adaptDock } from './responsive-dock'

import { useFollow } from '@/components/ide/follow'
import { IdeFrame } from '@/components/ide/ide-frame'
import { flyGhost, popIn } from '@/lib/motion'
import { cn } from '@/lib/utils'

import { DelegationPanel } from '@/components/chat/delegation-panel'
import { ComparePane } from '@/components/review/compare-pane'
import {
  useDelegationDock,
  useThreadDelegation,
} from '@/lib/theorem/delegations'
import { useReview, useReviewDock } from '@/lib/theorem/reviews'

const ARTIFACT = 'artifact:'
const NOTE = 'note-panel:'
const artifactPanelId = (artifactId: string) => `${ARTIFACT}${artifactId}`
const artifactIdOf = (panelId: string) =>
  panelId.startsWith(ARTIFACT) ? panelId.slice(ARTIFACT.length) : undefined
const FILE = 'file:'
const filePanelId = (path: string) => `${FILE}${path}`
const isFilePanel = (panelId: string) => panelId.startsWith(FILE)
const DELEGATION = 'delegation:'

const delegationPanelId = (delegationId: string) =>
  `${DELEGATION}${delegationId}`
const isDelegationPanel = (panelId: string) => panelId.startsWith(DELEGATION)
const REVIEW = 'review:'
const reviewPanelId = (reviewId: string) => `${REVIEW}${reviewId}`
const isReviewPanel = (panelId: string) => panelId.startsWith(REVIEW)

/** Panels that open beside the conversation and share its side group. */
const isSidePanel = (panelId: string) =>
  Boolean(artifactIdOf(panelId)) ||
  isFilePanel(panelId) ||
  isDelegationPanel(panelId)
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

/** The main panel: the conversation, or the mode's view in the Index, Pages, Spaces and the canvas. Theia covers the dock in IDE mode. */
function ThreadPanel({ api, containerApi }: IDockviewPanelProps) {
  const threadTitle = useAuiState((s) => s.threadListItem.title)
  const title = useProjectHomeTitle() ?? threadTitle
  const mode = useShellMode()
  useEffect(
    () =>
      api.setTitle(hasOwnView(mode) ? modeLabel(mode) : title || 'New chat'),
    [api, mode, title],
  )
  // Chat's breadcrumb stands in for the tab while the conversation is
  // alone in its group; a tab dropped beside it brings the tab bar back.
  const inChat = mode === 'chat'
  const alone = useSyncExternalStore(
    subscribe(api.group.api.onDidActivePanelChange),
    () => api.group.panels.length === 1,
  )
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- dockview's header takes this as a setter, and has no method for it.
    api.group.header.hidden = inChat && alone
  }, [api, inChat, alone])
  return (
    <div data-appearance-part="main" data-appearance-width-role="main" className="flex h-full min-w-0 flex-col">
      {inChat && (
        <ThreadHeader
          actions={
            alone ? (
              <GroupActions group={api.group} containerApi={containerApi} />
            ) : undefined
          }
        />
      )}
      <div className="relative min-h-0 flex-1">
        <ModeView docked />
      </div>
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

function DelegationDockPanel({
  api,
  params,
}: IDockviewPanelProps<{ delegationId: string }>) {
  const roleLabel = useThreadDelegation(params.delegationId)?.roleLabel
  useEffect(() => {
    if (roleLabel) api.setTitle(roleLabel)
  }, [api, roleLabel])
  return <DelegationPanel delegationId={params.delegationId} />
}

/**
 * Compare draws its own header: a way to fill the workspace with every option
 * side by side, and a way out of the window and back. Wherever the
 * conversation is not beside it, it carries the conversation's composer.
 */
function ReviewDockPanel({
  api,
  containerApi,
  params,
}: IDockviewPanelProps<{ reviewId: string }>) {
  const { reviewId } = params
  const count = useReview(reviewId).data?.options.length
  useEffect(() => {
    if (count) api.setTitle(`Compare ${count}`)
  }, [api, count])
  const location = useSyncExternalStore(
    subscribe(api.onDidLocationChange),
    () => api.location.type,
  )
  const expanded = useSyncExternalStore(
    subscribe(containerApi.onDidMaximizedGroupChange),
    () => api.isMaximized(),
  )
  // A dock too narrow for both opens Compare as a tab over the conversation.
  const overThread = useSyncExternalStore(
    subscribe(containerApi.onDidLayoutChange),
    () => api.group.panels.some((panel) => panel.id === THREAD),
  )
  // A tab opened quietly behind the conversation answers nothing until shown.
  const visible = useSyncExternalStore(
    subscribe(api.onDidVisibilityChange),
    () => api.isVisible,
  )
  const close = () => {
    const panel = containerApi.getPanel(api.id)
    if (panel) containerApi.removePanel(panel)
  }
  const detach = async () => {
    const panel = containerApi.getPanel(api.id)
    if (!panel) return
    if (location !== 'grid') {
      const thread = containerApi.getPanel(THREAD)
      if (thread) panel.api.moveTo({ group: thread.group, position: 'right' })
      return
    }
    // A blocked popup still lets the pane float clear of the conversation.
    const opened = await containerApi.addPopoutGroup(panel.group)
    if (!opened)
      containerApi.addFloatingGroup(panel, { width: 520, height: 720 })
  }
  return (
    <ComparePane
      reviewId={reviewId}
      onClose={close}
      onDetach={() => void detach()}
      detached={location !== 'grid'}
      expanded={expanded}
      onExpandedChange={(next) => (next ? api.maximize() : api.exitMaximized())}
      standalone={visible && (expanded || overThread || location !== 'grid')}
    />
  )
}

const GraphPanel = lazy(() =>
  import('@/components/inspector/graph-panel').then((module) => ({
    default: module.GraphPanel,
  })),
)

/** The inspector's panels draw on the surface the files beside them do. */
const inspector = (Panel: React.ComponentType) =>
  function InspectorPanel() {
    return (
      <div className="relative h-full bg-artifact">
        <Suspense>
          <Panel />
        </Suspense>
      </div>
    )
  }

const components = {
  thread: ThreadPanel,
  outline: inspector(OutlinePanel),
  links: inspector(LinksPanel),
  graph: inspector(GraphPanel),
  // Layouts saved while the IDE was a dock panel name it; restoreLayout drops it.
  ide: () => <IdeFrame />,
  artifact: ArtifactDockPanel,
  note: NoteDockPanel,
  [WORKSPACE_FILE_COMPONENT]: WorkspaceFileDockPanel,
  file: FileDockPanel,
  delegation: DelegationDockPanel,
  review: ReviewDockPanel,
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
      <Icon.Follow className="size-4" />
    </TooltipIconButton>
  )
}

/** Lays the dock out as `arrangement` and opens, closes or fills the navigator. */
export function arrangeWorkspace(
  api: DockviewApi,
  arrangement: Arrangement,
  mode: ShellMode,
) {
  const { navigator } = arrange(api, arrangement)
  const shell = useShell.getState()
  shell.setPanelOpen(navigatorMode(mode), navigator !== 'closed')
  if (navigator === 'files') shell.setFilesShown(true)
}

/** Which inspector panels the dock holds, kept current with its layout. */
function useShownInspector(api: DockviewApi) {
  const shown = useSyncExternalStore(subscribe(api.onDidLayoutChange), () =>
    (Object.keys(INSPECTOR_TOOLS) as Array<InspectorTool>)
      .filter((id) => api.getPanel(id))
      .join(' '),
  )
  return new Set(shown.split(' '))
}

/**
 * The conversation's panels menu: the arrangements, the inspector beside the
 * files, and the terminal drawers. New chat lives in the sidebar.
 */
function GroupActions({
  group,
  containerApi,
}: Pick<IDockviewHeaderActionsProps, 'group' | 'containerApi'>) {
  const holds = useSyncExternalStore(
    subscribe(containerApi.onDidMaximizedGroupChange),
    () => holdsPanelsMenu(group),
  )
  return holds ? <PanelsMenu api={containerApi} /> : null
}

function PanelsMenu({ api }: { api: DockviewApi }) {
  const mode = useShellMode()
  const shown = useShownInspector(api)
  const toggle = (tool: InspectorTool) => {
    const panel = api.getPanel(tool)
    if (panel) api.removePanel(panel)
    else addInspector(api, tool)
  }
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
              <Menu.Group>
                <Menu.GroupLabel className="px-2 pt-1 pb-1.5 text-xs text-ink-faint">
                  Arrange
                </Menu.GroupLabel>
                {(Object.keys(ARRANGEMENTS) as Array<Arrangement>).map(
                  (arrangement) => (
                    <Menu.Item
                      key={arrangement}
                      className={menuItem}
                      onClick={() => arrangeWorkspace(api, arrangement, mode)}
                    >
                      {ARRANGEMENTS[arrangement]}
                    </Menu.Item>
                  ),
                )}
              </Menu.Group>
              <Menu.Separator className="my-1 h-px bg-separator" />
              <Menu.Group>
                <Menu.GroupLabel className="px-2 pt-1 pb-1.5 text-xs text-ink-faint">
                  Inspector
                </Menu.GroupLabel>
                {(Object.keys(INSPECTOR_TOOLS) as Array<InspectorTool>).map(
                  (tool) => (
                    <Menu.CheckboxItem
                      key={tool}
                      className={menuItem}
                      checked={shown.has(tool)}
                      onCheckedChange={() => toggle(tool)}
                    >
                      <span className="flex size-4 items-center justify-center">
                        <Menu.CheckboxItemIndicator>
                          <Icon.Check className="size-3.5" />
                        </Menu.CheckboxItemIndicator>
                      </span>
                      {INSPECTOR_TOOLS[tool]}
                    </Menu.CheckboxItem>
                  ),
                )}
              </Menu.Group>
              <Menu.Separator className="my-1 h-px bg-separator" />
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

/** Below this the conversation's column is not laid out. */
const THREAD_MIN_WIDTH = 0

function buildDefaultLayout(api: DockviewApi) {
  api.addPanel({
    id: THREAD,
    component: 'thread',
    tabComponent: 'fixed',
    title: 'New chat',
    minimumWidth: THREAD_MIN_WIDTH,
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
  const sibling = api.panels.find((panel) => isSidePanel(panel.id))
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

function openDelegation(api: DockviewApi, delegationId: string, title: string) {
  openSide(api, {
    id: delegationPanelId(delegationId),
    component: 'delegation',
    params: { delegationId },
    title,
  })
}
/** Compare's column opens this wide, or at 40% of a dock too narrow for that. */
const COMPARE_WIDTH = 380
/** The conversation keeps this much beside Compare, which otherwise opens over it. */
const CONVERSATION_WIDTH = 480

/**
 * Compare opens in a column of its own, with its own header in place of the
 * tab, and a quiet open leaves the keyboard in the conversation. The column
 * has a set width, so a wide window gives the room to the conversation; a
 * dock with no room for both opens Compare over the conversation as a tab.
 */
function openReviewPanel(
  api: DockviewApi,
  reviewId: string,
  quiet: boolean | undefined,
) {
  const id = reviewPanelId(reviewId)
  const existing = api.getPanel(id)
  if (existing) {
    existing.api.setActive()
    return
  }
  openBeside(
    api,
    {
      id,
      component: 'review',
      params: { reviewId },
      title: 'Compare',
      minimumWidth: 340,
    },
    THREAD,
    Math.min(0.4, COMPARE_WIDTH / api.width),
    CONVERSATION_WIDTH - THREAD_MIN_WIDTH,
  )
  const panel = api.getPanel(id)
  if (panel && panel.group.panels.length === 1) panel.group.header.hidden = true
  if (quiet) api.getPanel(THREAD)?.api.setActive()
  // Dockview can keep an always-rendered panel at its old width when a column
  // opens mid-frame, until the next layout. Lay out once the frame has settled.
  requestAnimationFrame(() => api.layout(api.width, api.height, true))
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
  const host = useRef<HTMLDivElement>(null)
  const adaptation = useRef<ReturnType<typeof adaptDock> | null>(null)
  useEffect(() => {
    if (!dock || !host.current) return
    const adapter = adaptDock(dock, host.current)
    adaptation.current = adapter
    return () => {
      adapter.dispose()
      adaptation.current = null
    }
  }, [dock])
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
    const save = () => {
      const layout = adaptation.current
        ? adaptation.current.layoutForSave()
        : dock.toJSON()
      if (layout)
        useShell.getState().saveLayout(projectId, {
          threadId: layoutThread.current,
          dock: layout,
        })
    }
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
      dock: {
        open: (file, replacing) =>
          openWorkspaceFilePanel(dock, file, THREAD, replacing),
      },
    })
    useFileDock.setState({ open: (path) => openFile(dock, projectId, path) })
    useDelegationDock.setState({
      open: (delegationId, title) => openDelegation(dock, delegationId, title),
    })
    useReviewDock.setState({
      open: (reviewId, options) =>
        openReviewPanel(dock, reviewId, options?.quiet),
      close: (reviewId) => {
        const panel = dock.getPanel(reviewPanelId(reviewId))
        if (panel) dock.removePanel(panel)
      },
    })
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
      { dispose: followFront(dock) },
      ...springMaximize(dock),
    ]
    return () => {
      for (const listener of listeners) listener.dispose()
      useArtifactView.setState({ dock: undefined })
      useNoteView.setState({ dock: undefined })
      useWorkspaceFileView.setState({ dock: undefined })
      useFileDock.setState({ open: undefined })
      useDelegationDock.setState({ open: undefined })
      useReviewDock.setState({ open: undefined, close: undefined })
    }
  }, [dock, projectId])

  // A different conversation starts without the previous one's artifacts and delegations. A
  // new chat gaining its first id is the same conversation, so it keeps them.
  useEffect(() => {
    if (!dock || layoutThread.current === threadId) return
    const previous = layoutThread.current
    layoutThread.current = threadId
    if (previous !== undefined) {
      for (const panel of dock.panels)
        if (
          artifactIdOf(panel.id) ||
          isDelegationPanel(panel.id) ||
          isReviewPanel(panel.id)
        )
          dock.removePanel(panel)
      useArtifactView.getState().reset()
    }
    const layout = adaptation.current
      ? adaptation.current.layoutForSave()
      : dock.toJSON()
    if (layout)
      useShell.getState().saveLayout(projectId, {
        threadId,
        dock: layout,
      })
  }, [dock, threadId, projectId])

  return (
    <div ref={host} data-appearance-part="dock" className="h-full min-w-0">
      <DockviewReact
        className="h-full w-full"
        theme={theme}
        components={components}
        tabComponents={tabComponents}
        rightHeaderActionsComponent={GroupActions}
        defaultRenderer="always"
        floatingGroupBounds="boundedWithinViewport"
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
    </div>
  )
}
