// SOURCING: react-resizable-panels (thread/artifact split), Base UI Drawer (phone sidebar), Base UI useMediaQuery, assistant-ui Thread element
import { ThreadListPrimitive, useAuiState } from '@assistant-ui/react'
import { Drawer } from '@base-ui/react/drawer'
import { useMediaQuery } from '@base-ui/react/unstable-use-media-query'
import { useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { ArtifactPanel } from '@/components/artifacts/artifact-panel'
import { useThreadArtifacts } from '@/components/artifacts/artifact-model'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import { cn } from '@/lib/utils'
import { useShell } from './shell-state'
import { SidebarContents } from './sidebar'

const iconButton = 'size-9 p-2'

function ChatHeader({
  onOpenSidebar,
}: {
  onOpenSidebar: (() => void) | undefined
}) {
  const title = useAuiState((s) => s.threadListItem.title)
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 px-2">
      {onOpenSidebar && (
        <>
          <TooltipIconButton
            tooltip="Open sidebar"
            className={iconButton}
            onClick={onOpenSidebar}
          >
            <Icon.Layout className="size-[18px]" />
          </TooltipIconButton>
          <ThreadListPrimitive.New
            render={
              <TooltipIconButton tooltip="New chat" className={iconButton} />
            }
          >
            <Icon.NewChat className="size-[18px]" />
          </ThreadListPrimitive.New>
        </>
      )}
      <h1 className="min-w-0 truncate px-2 text-sm text-ink-muted">
        {title || 'New chat'}
      </h1>
    </header>
  )
}

/** Sidebar, conversation and artifact canvas. Mounted inside TheoremRuntimeProvider. */
export function ChatShell() {
  const desktop = useMediaQuery('(min-width: 768px)', { noSsr: true })
  const sidebarOpen = useShell((s) => s.sidebarOpen)
  const setSidebarOpen = useShell((s) => s.setSidebarOpen)

  const openId = useArtifactView((s) => s.openId)
  const expanded = useArtifactView((s) => s.expanded)
  const artifacts = useThreadArtifacts()
  const showArtifact = Boolean(openId && artifacts.get(openId)?.length)

  // A different conversation starts with the canvas closed.
  const threadId = useAuiState((s) => s.threadListItem.id)
  useEffect(() => useArtifactView.getState().close(), [threadId])

  // The phone drawer belongs to the thread it was opened from, so picking a
  // chat in it closes it without an effect.
  const [drawerThread, setDrawerThread] = useState<string | null>(null)
  const drawerOpen = drawerThread === threadId
  const setDrawerOpen = (open: boolean) =>
    setDrawerThread(open ? threadId : null)

  // Expanding the canvas collapses the conversation panel rather than unmounting
  // it, so the thread keeps its scroll position and composer focus.
  const threadPanel = useRef<PanelImperativeHandle | null>(null)
  useEffect(() => {
    const panel = threadPanel.current
    if (!panel) return
    if (showArtifact && expanded) panel.collapse()
    else if (panel.isCollapsed()) panel.expand()
  }, [showArtifact, expanded])

  const onOpenSidebar = desktop
    ? sidebarOpen
      ? undefined
      : () => setSidebarOpen(true)
    : () => setDrawerOpen(true)

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-ink">
      {desktop && sidebarOpen && (
        <aside className="w-(--spacing-sidebar) shrink-0 border-e border-separator bg-sidebar">
          <SidebarContents onClose={() => setSidebarOpen(false)} />
        </aside>
      )}
      {!desktop && (
        <Drawer.Root
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          swipeDirection="left"
        >
          <Drawer.Portal>
            <Drawer.Backdrop className="fixed inset-0 bg-black/30 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0" />
            <Drawer.Viewport className="fixed inset-0 flex items-stretch justify-start">
              <Drawer.Popup className="h-full w-[min(var(--spacing-sidebar),85vw)] border-e border-separator bg-sidebar outline-none [transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-300 ease-(--ease-structure) data-ending-style:[transform:translateX(-100%)] data-starting-style:[transform:translateX(-100%)] data-swiping:duration-0">
                <Drawer.Title className="sr-only">Chats</Drawer.Title>
                <SidebarContents
                  onClose={() => setDrawerOpen(false)}
                  closeLabel="Close"
                />
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
      )}

      <Group orientation="horizontal" className="min-w-0 flex-1">
        <Panel
          id="thread"
          panelRef={threadPanel}
          collapsible
          collapsedSize={0}
          minSize={360}
          className="flex h-full flex-col"
        >
          <ChatHeader onOpenSidebar={onOpenSidebar} />
          <div className="min-h-0 flex-1">
            <Thread />
          </div>
        </Panel>
        {desktop && showArtifact && (
          <>
            <Separator
              className={cn(
                'w-px bg-separator transition-colors duration-100',
                'data-[separator=hover]:bg-control data-[separator=active]:bg-focus',
                expanded && 'hidden',
              )}
            />
            <Panel id="artifact" minSize={400} defaultSize="55%">
              <ArtifactPanel />
            </Panel>
          </>
        )}
      </Group>

      {!desktop && showArtifact && (
        <ArtifactPanel className="fixed inset-0 z-40" />
      )}
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
      <p className="font-heading text-[20px] font-normal tracking-tight">{title}</p>
      {detail && <p className="max-w-md text-sm text-ink-muted">{detail}</p>}
    </div>
  )
}
