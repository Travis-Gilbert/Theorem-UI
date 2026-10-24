// SOURCING: dockview-react (docking layout: tabs, splits, floating groups, maximize, serialization, always-rendered panels), the shell's ModeView (assistant-ui Thread in chat mode) and ThreadListPrimitive.New, the IDE frame (browser-only Theia), zustand stores for artifact view and saved layouts
import { ThreadListPrimitive, useAuiState } from '@assistant-ui/react'
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
import { useFollow } from '@/components/ide/follow'
import { IdeFrame } from '@/components/ide/ide-frame'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ModeView, modeLabel, useShellMode } from './modes'
import { useShell } from './shell-state'

const THREAD = 'thread'
const ARTIFACT = 'artifact:'

const artifactPanelId = (artifactId: string) => `${ARTIFACT}${artifactId}`
const artifactIdOf = (panelId: string) =>
  panelId.startsWith(ARTIFACT) ? panelId.slice(ARTIFACT.length) : undefined

/** Colours come from the Stone tokens, which already switch under `.dark`. */
const theme: DockviewTheme = {
  name: 'stone',
  className: 'dockview-theme-stone',
}

/** Subscribes React to a dockview event; dockview events return a disposable. */
function subscribe(event: (listener: () => void) => { dispose: () => void }) {
  return (onChange: () => void) => {
    const disposable = event(onChange)
    return () => disposable.dispose()
  }
}

/** The main panel: the conversation, or the mode's view in the Index and Spaces. Theia covers the dock in IDE mode. */
function ThreadPanel({ api }: IDockviewPanelProps) {
  const title = useAuiState((s) => s.threadListItem.title)
  const mode = useShellMode()
  useEffect(
    () =>
      api.setTitle(
        mode === 'spaces' || mode === 'index'
          ? modeLabel(mode)
          : title || 'New chat',
      ),
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

const components = {
  thread: ThreadPanel,
  // Layouts saved while the IDE was a dock panel name it; restoreLayout drops it.
  ide: IdeFrame,
  artifact: ArtifactDockPanel,
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

function GroupActions({ panels }: IDockviewHeaderActionsProps) {
  if (!panels.some((panel) => panel.id === THREAD)) return null
  return (
    <div className="flex h-full items-center pe-1">
      <FollowToggle />
      <ThreadListPrimitive.New
        render={
          <TooltipIconButton tooltip="New chat" className="size-7 p-1.5" />
        }
      >
        <Icon.NewChat className="size-4" />
      </ThreadListPrimitive.New>
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

/** New artifacts join the existing artifact tabs, else open beside the conversation. */
function openArtifact(api: DockviewApi, artifactId: string) {
  const id = artifactPanelId(artifactId)
  const existing = api.getPanel(id)
  if (existing) {
    existing.api.setActive()
    return
  }
  const options = {
    id,
    component: 'artifact',
    params: { artifactId },
    title: 'Artifact',
    minimumWidth: 400,
  }
  const sibling = api.panels.find((panel) => artifactIdOf(panel.id))
  if (sibling) {
    api.addPanel({ ...options, position: { referenceGroup: sibling.group } })
    return
  }
  const initialWidth = Math.round(api.width * 0.55)
  if (api.getPanel(THREAD)?.api.location.type === 'grid')
    api.addPanel({
      ...options,
      initialWidth,
      position: { referencePanel: THREAD, direction: 'right' },
    })
  else
    api.addPanel({ ...options, initialWidth, position: { direction: 'right' } })
}

/**
 * Desktop dock: the conversation and each open artifact as dock panels. Panels render always, so moving or hiding one
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
    ]
    return () => {
      for (const listener of listeners) listener.dispose()
      useArtifactView.setState({ dock: undefined })
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
