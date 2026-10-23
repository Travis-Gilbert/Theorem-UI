// SOURCING: dockview-react via DockShell (desktop layout), Base UI Drawer (phone sidebar), Base UI useMediaQuery, the shell's ModeView (assistant-ui Thread in chat mode), AgentComposer (Base UI Popover), NotePanel (Milkdown Crepe)
import type { SplitviewApi, SplitviewReadyEvent } from 'dockview-react'
import { AgentComposer } from '@/components/canvas/agent-composer'
import { ArtifactPanel } from '@/components/artifacts/artifact-panel'
import { ContextPanel } from './sidebar'
import { DockShell } from './dock'
import { Drawer } from '@base-ui/react/drawer'
import { Icon } from '@/components/icons'
import { LayoutPriority, Orientation, SplitviewReact } from 'dockview-react'
import { ModeView, modeLabel, useShellMode } from './modes'
import { NotePanel } from '@/components/notes/note-panel'
import { PANEL_WIDTH, useShell } from './shell-state'
import { Rail } from './rail'
import { ThreadListPrimitive, useAuiState } from '@assistant-ui/react'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { createContext, useContext, useEffect, useState } from 'react'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import { useCanvasView } from '@/components/canvas/canvas-view'
import { useMediaQuery } from '@base-ui/react/unstable-use-media-query'
import { useNoteView } from '@/components/notes/note-view'

const iconButton = 'size-9 p-2'

function ChatHeader({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const title = useAuiState((s) => s.threadListItem.title)
  const mode = useShellMode()
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 px-2">
      <TooltipIconButton
        tooltip="Open sidebar"
        className={iconButton}
        onClick={onOpenSidebar}
      >
        <Icon.Layout className="size-[18px]" />
      </TooltipIconButton>
      <ThreadListPrimitive.New
        render={<TooltipIconButton tooltip="New chat" className={iconButton} />}
      >
        <Icon.NewChat className="size-[18px]" />
      </ThreadListPrimitive.New>
      <h1 className="min-w-0 truncate px-2 text-sm text-ink-muted">
        {mode === 'chat' ? title || 'New chat' : modeLabel(mode)}
      </h1>
    </header>
  )
}

/**
 * Phone shell: the conversation fills the screen and the rail and its panel
 * open together in a drawer. The open artifact covers the conversation.
 */
function PhoneShell() {
  const openId = useArtifactView((s) => s.openId)
  const close = useArtifactView((s) => s.close)
  const noteId = useNoteView((s) => s.openId)
  const closeNote = useNoteView((s) => s.close)

  // A different conversation starts with the artifact closed.
  const threadId = useAuiState((s) => s.threadListItem.id)
  useEffect(() => useArtifactView.getState().reset(), [threadId])

  // The drawer belongs to the thread, mode, open note and canvas focus it was
  // opened from, so picking a chat, a mode or a note in it closes it without
  // an effect.
  const mode = useShellMode()
  const focusCount = useCanvasView((s) => s.focusCount)
  const view = `${mode}:${threadId}:${noteId}:${focusCount}`
  const [drawerView, setDrawerView] = useState<string | null>(null)
  const drawerOpen = drawerView === view
  const setDrawerOpen = (open: boolean) => setDrawerView(open ? view : null)

  return (
    <>
      <Drawer.Root
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        swipeDirection="left"
      >
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 bg-black/30 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0" />
          <Drawer.Viewport className="fixed inset-0 flex items-stretch justify-start">
            <Drawer.Popup className="flex h-full w-[min(calc(var(--spacing-rail)+var(--spacing-sidebar)),90vw)] bg-rail outline-none [--sheet-h:calc(100dvh-2*var(--sheet-inset))] [--sheet-inset:3px] [transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-300 ease-(--ease-structure) data-ending-style:[transform:translateX(-100%)] data-starting-style:[transform:translateX(-100%)] data-swiping:duration-0">
              <Drawer.Title className="sr-only">Navigation</Drawer.Title>
              <Rail />
              <div className="relative my-(--sheet-inset) me-(--sheet-inset) min-w-0 flex-1">
                <div aria-hidden="true" className="lift-glow" />
                <div className="relative h-full overflow-hidden rounded-xl bg-sheet shadow-sheet">
                  <ContextPanel />
                </div>
              </div>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>

      <div className="flex h-full min-w-0 flex-1 flex-col bg-sheet [--sheet-h:100dvh] [--sheet-inset:0px]">
        <ChatHeader onOpenSidebar={() => setDrawerOpen(true)} />
        <div className="min-h-0 flex-1">
          <ModeView />
        </div>
      </div>

      {openId && (
        <ArtifactPanel
          artifactId={openId}
          onClose={() => close(openId)}
          className="fixed inset-0 z-40"
        />
      )}

      {noteId && (
        <NotePanel
          documentId={noteId}
          onClose={closeNote}
          className="fixed inset-0 z-40"
        />
      )}
    </>
  )
}

/** What the dock beside the context panel shows. */
type DockRoute = { projectId: string; threadId: string | undefined }
const DockRouteContext = createContext<DockRoute | null>(null)

function DockView() {
  const route = useContext(DockRouteContext)
  if (!route) throw new Error('DockView renders inside the desktop sheet')
  return <DockShell projectId={route.projectId} threadId={route.threadId} />
}
const PANEL = 'panel'

const splitComponents = {
  [PANEL]: ContextPanel,
  dock: DockView,
}

/**
 * The sheet's two columns: the active mode's panel and the dock. The panel
 * keeps its width as the window resizes, can be dragged within its range and
 * closes per mode from the rail.
 */
function SheetSplit(route: DockRoute) {
  const mode = useShellMode()
  const panelOpen = useShell((s) => !s.panelCollapsed[mode])
  const [split, setSplit] = useState<SplitviewApi>()

  const onReady = ({ api }: SplitviewReadyEvent) => {
    api.addPanel({
      id: PANEL,
      component: PANEL,
      size: useShell.getState().panelWidth,
      minimumSize: PANEL_WIDTH.min,
      maximumSize: PANEL_WIDTH.max,
      priority: LayoutPriority.Low,
    })
    api.addPanel({
      id: 'dock',
      component: 'dock',
      minimumSize: 360,
      priority: LayoutPriority.High,
    })
    setSplit(api)
  }

  useEffect(() => {
    split?.getPanel(PANEL)?.api.setVisible(panelOpen)
  }, [split, panelOpen])

  // The width a drag leaves the panel at is the width it reopens with.
  useEffect(() => {
    const panel = split?.getPanel(PANEL)
    if (!panel) return
    const listener = panel.api.onDidDimensionsChange(({ width }) => {
      if (panel.api.isVisible && width > 0)
        useShell.getState().setPanelWidth(width)
    })
    return () => listener.dispose()
  }, [split])

  return (
    <DockRouteContext.Provider value={route}>
      <SplitviewReact
        className="sheet-split dockview-theme-stone h-full w-full"
        orientation={Orientation.HORIZONTAL}
        proportionalLayout={false}
        components={splitComponents}
        onReady={onReady}
      />
    </DockRouteContext.Provider>
  )
}

/**
 * Desktop shell: the rail is the base, and one rounded sheet sits on it,
 * inset by --sheet-inset from the window, holding the panel and the dock.
 * The sheet lifts off the rail by a shadow in light and a glow in dark.
 */
function DesktopShell(route: DockRoute) {
  return (
    <div className="flex h-full w-full [--sheet-h:calc(100dvh-2*var(--sheet-inset))] [--sheet-inset:3px]">
      <Rail collapsible />
      <div className="relative my-(--sheet-inset) me-(--sheet-inset) min-w-0 flex-1">
        <div aria-hidden="true" className="lift-glow" />
        <div className="relative h-full overflow-hidden rounded-xl bg-sheet shadow-sheet">
          <SheetSplit {...route} />
        </div>
      </div>
    </div>
  )
}
/** Rail, panel, conversation and artifacts. Mounted inside TheoremRuntimeProvider. */
export function ChatShell({
  projectId,
  threadId,
}: {
  projectId: string
  threadId: string | undefined
}) {
  const desktop = useMediaQuery('(min-width: 768px)', { noSsr: true })
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-rail text-ink">
      {desktop ? (
        <DesktopShell projectId={projectId} threadId={threadId} />
      ) : (
        <PhoneShell />
      )}
      <AgentComposer projectId={projectId} />
    </div>
  )
}

/** Full-height status for the shell before a project is available. */
export function ShellStatus({
  title,
  detail,
}: {
  title: string
  detail?: string
}) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-background px-6 text-center">
      <p className="font-heading text-[20px] font-normal tracking-tight">
        {title}
      </p>
      {detail && <p className="max-w-md text-sm text-ink-muted">{detail}</p>}
    </div>
  )
}
