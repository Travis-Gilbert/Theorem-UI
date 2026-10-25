// SOURCING: Base UI Drawer (swipeDirection right) is the right-hand drawer; anime.js createDraggable drags its edge (1:1 tracking, resistance past the width range, spring back on release) and Base UI useMediaQuery keeps that to desktop; the tabbed terminal and each tab's agent are terminal-screen's (Ratzilla with ratatui Tabs over assistant-ui runtimes); zustand shell state keeps the tabs per project
import { Drawer } from '@base-ui/react/drawer'
import { useMediaQuery } from '@base-ui/react/unstable-use-media-query'
import { createDraggable } from 'animejs'
import { useEffect, useRef } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { useActiveProject } from '@/components/shell/projects'
import { useShell } from '@/components/shell/shell-state'
import {
  TerminalAgent,
  TerminalScreen,
  restartSession,
  runSessionAction,
  stopSession,
  useCloseOnOutsideDoubleClick,
} from './terminal-screen'
import type { TerminalAction } from './terminal-screen'

const HOST_ID = 'theorem-side-terminal'

/** The drawer's narrowest width; the widest leaves the rail and some sheet showing. */
const MIN_WIDTH = 380
const maxWidth = () =>
  Math.max(MIN_WIDTH, Math.min(1200, window.innerWidth - 120))

/**
 * The drawer's left edge, dragged to set its width. The draggable's x is the
 * width negated (dragging left widens), kept between the bounds and written to
 * the popup while the pointer moves; the width it settles at is kept.
 */
function WidthHandle({ popup }: { popup: RefObject<HTMLDivElement | null> }) {
  const handle = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = handle.current
    if (!element) return
    const draggable = createDraggable(element, {
      // The handle itself stays put; only the popup's width follows x.
      x: { mapTo: '--drag-x' },
      y: false,
      container: () => [0, -MIN_WIDTH, 0, -maxWidth()],
      // No throw on release: the edge stops where it is let go, springing
      // back only from past the range.
      velocityMultiplier: 0,
      cursor: { onHover: 'ew-resize', onGrab: 'ew-resize' },
      onUpdate: (self) =>
        popup.current?.style.setProperty('--side-width', `${-self.x}px`),
      onSettle: (self) => useShell.getState().setSideWidth(Math.round(-self.x)),
    })
    draggable.setX(-useShell.getState().sideWidth, true)
    return () => {
      draggable.revert()
    }
  }, [popup])

  return (
    <div
      ref={handle}
      aria-hidden="true"
      data-base-ui-swipe-ignore=""
      className="group flex w-3 shrink-0 touch-none items-center justify-center"
    >
      <span className="h-9 w-1 rounded-full bg-term-line transition-[height,background-color] duration-(--duration-snap) ease-snap group-hover:h-14 group-hover:bg-term-muted" />
    </div>
  )
}

/**
 * The right-hand drawer, a terminal with tabs: each tab its own agent thread,
 * all running while the drawer is closed. A project's first open starts it
 * with one tab.
 */
export function SideTerminal() {
  const open = useShell((s) => s.sideDrawer === 'terminal')
  const setSideDrawer = useShell((s) => s.setSideDrawer)
  const width = useShell((s) => s.sideWidth)
  const desktop = useMediaQuery('(min-width: 768px)', { noSsr: true })
  const popup = useRef<HTMLDivElement>(null)
  const { project } = useActiveProject()
  const projectId = project?.projectId
  const entry = useShell((s) =>
    projectId ? s.terminalTabs[projectId] : undefined,
  )
  const tabs = entry?.tabs ?? []
  useCloseOnOutsideDoubleClick(open, () => setSideDrawer(undefined))

  useEffect(() => {
    if (open && projectId && !entry?.tabs.length)
      useShell.getState().openTerminalTab(projectId)
  }, [open, projectId, entry])

  const onAction = (action: TerminalAction) => {
    if (runSessionAction(action) || !projectId) return
    const shell = useShell.getState()
    switch (action.type) {
      case 'close':
        shell.setSideDrawer(undefined)
        return
      case 'new':
        restartSession(action.tab, projectId, action.tab)
        return
      case 'newTab':
        shell.openTerminalTab(projectId)
        return
      case 'closeTab':
        stopSession(action.tab)
        shell.closeTerminalTab(projectId, action.tab)
        return
      case 'selectTab':
        shell.selectTerminalTab(projectId, action.tab)
        return
    }
  }

  return (
    <>
      {project &&
        tabs.map((tab) => (
          <TerminalAgent
            key={`${project.projectId}:${tab.id}`}
            sessionKey={tab.id}
            tabId={tab.id}
            projectId={project.projectId}
            project={project.title}
          />
        ))}
      <Drawer.Root
        open={open}
        onOpenChange={(next) => setSideDrawer(next ? 'terminal' : undefined)}
        modal={false}
        disablePointerDismissal
        swipeDirection="right"
      >
        <Drawer.Portal keepMounted>
          <Drawer.Viewport className="pointer-events-none fixed inset-0 z-40">
            <Drawer.Popup
              ref={popup}
              data-terminal-drawer=""
              style={{ '--side-width': `${width}px` } as CSSProperties}
              initialFocus={() => document.getElementById(HOST_ID)}
              className="pointer-events-auto absolute top-[3px] right-[3px] bottom-[3px] flex w-[calc(100vw-6px)] overflow-hidden rounded-xl bg-term shadow-[-8px_0_32px_rgb(0_0_0/0.28)] outline-none [transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-[calc(var(--duration-glide)*var(--drawer-swipe-strength))] ease-glide data-ending-style:duration-(--duration-exit) data-ending-style:ease-exit data-ending-style:[transform:translateX(calc(100%+8px))] data-starting-style:[transform:translateX(calc(100%+8px))] data-swiping:duration-0 data-swiping:select-none md:w-[min(var(--side-width),calc(100vw-120px))]"
            >
              <Drawer.Title className="sr-only">Agent terminal</Drawer.Title>
              {desktop ? (
                <WidthHandle popup={popup} />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex w-3 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
                >
                  <span className="h-9 w-1 rounded-full bg-term-line" />
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col pt-1.5">
                <TerminalScreen
                  hostId={HOST_ID}
                  tabbed
                  tabs={tabs}
                  active={entry?.active ?? ''}
                  onAction={onAction}
                />
              </div>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}
