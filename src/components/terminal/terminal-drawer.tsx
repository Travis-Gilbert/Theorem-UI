// SOURCING: Base UI Drawer is the bottom drawer; the terminal and its agent are terminal-screen's (Ratzilla over an assistant-ui runtime)
import { Drawer } from '@base-ui/react/drawer'
import { useEffect } from 'react'
import { useActiveProject } from '@/components/shell/projects'
import { useShell } from '@/components/shell/shell-state'
import {
  TerminalAgent,
  TerminalScreen,
  restartSession,
  runSessionAction,
  useCloseOnOutsideDoubleClick,
} from './terminal-screen'
import type { TerminalAction } from './terminal-screen'

const HOST_ID = 'theorem-terminal'
const SESSION = 'bottom'
const TABS = [{ id: SESSION, title: 'agent' }]
/**
 * Heights the drawer settles at, as shares of the window; the popup itself is
 * as tall as the last. Dragging below the first closes it.
 */
const SNAP_POINTS = [0.28, 0.46, 0.66, 1]

/**
 * The agent terminal: a bottom drawer over the sheet, separate from the chat,
 * where agent work runs on its own thread. Its handle drags it between the
 * snap points, and the height it settles at is kept. It stays mounted when
 * closed so the terminal and its run carry on; ctrl+` toggles it.
 */
export function TerminalDrawer() {
  const open = useShell((s) => s.terminalOpen)
  const setOpen = useShell((s) => s.setTerminalOpen)
  const height = useShell((s) => s.terminalHeight)
  const setHeight = useShell((s) => s.setTerminalHeight)
  const { project } = useActiveProject()
  useCloseOnOutsideDoubleClick(open, () => setOpen(false))

  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === '`') {
        event.preventDefault()
        const shell = useShell.getState()
        shell.setTerminalOpen(!shell.terminalOpen)
      }
    }
    window.addEventListener('keydown', toggle)
    return () => window.removeEventListener('keydown', toggle)
  }, [])

  const onAction = (action: TerminalAction) => {
    if (runSessionAction(action)) return
    if (action.type === 'close') setOpen(false)
    if (action.type === 'new' && project)
      restartSession(SESSION, project.projectId, undefined)
  }

  return (
    <>
      {project && (
        <TerminalAgent
          key={project.projectId}
          sessionKey={SESSION}
          projectId={project.projectId}
          project={project.title}
        />
      )}
      <Drawer.Root
        open={open}
        onOpenChange={setOpen}
        modal={false}
        disablePointerDismissal
        swipeDirection="down"
        snapPoints={SNAP_POINTS}
        snapToSequentialPoints
        snapPoint={height}
        onSnapPointChange={(next) => {
          if (typeof next === 'number') setHeight(next)
        }}
      >
        <Drawer.Portal keepMounted>
          <Drawer.Viewport className="pointer-events-none fixed inset-0 z-30 flex items-end">
            <Drawer.Popup
              data-terminal-drawer=""
              initialFocus={() => document.getElementById(HOST_ID)}
              className="pointer-events-auto absolute right-[3px] bottom-[3px] left-[3px] flex h-[calc(100dvh-56px)] [--shown-offset:var(--drawer-snap-point-offset)] flex-col overflow-hidden rounded-xl bg-term shadow-[0_-8px_32px_rgb(0_0_0/0.28)] outline-none [transform:translateY(calc(var(--drawer-snap-point-offset)+var(--drawer-swipe-movement-y)))] transition-transform duration-[calc(var(--duration-glide)*var(--drawer-swipe-strength))] ease-glide data-ending-style:duration-(--duration-exit) data-ending-style:ease-exit data-ending-style:[transform:translateY(calc(100%+8px))] data-starting-style:[transform:translateY(calc(100%+8px))] data-swiping:duration-0 data-swiping:select-none md:left-[calc(var(--spacing-rail)+3px)]"
            >
              <Drawer.Title className="sr-only">Agent terminal</Drawer.Title>
              <div
                aria-hidden="true"
                className="flex h-3 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
              >
                <span className="h-1 w-9 rounded-full bg-term-line" />
              </div>
              {/* The popup sits partly below the window at the lower snap
                  points; the terminal takes only the part that shows. Base UI
                  registers the offset as not inherited, so the popup passes
                  it down as --shown-offset. */}
              <div className="flex h-[calc(100%-var(--shown-offset)-12px)] min-h-0 flex-col">
                <TerminalScreen
                  hostId={HOST_ID}
                  tabbed={false}
                  tabs={TABS}
                  active={SESSION}
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
