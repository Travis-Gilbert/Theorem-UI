// SOURCING: dockview-react SplitviewReact (the split SheetSplit also uses: fixed sizes, a draggable sash that masks iframes while it moves, layout priorities), the IDE frame (browser-only Theia), the tabbed agent terminal (terminal-screen's TerminalScreen over side-terminal's useTerminalTabs, the same tabs the right drawer shows), zustand shell state for the terminal's width
//
// IDE mode on the desktop: Theia with the agent terminal docked on its right.
// The terminal is where the person talks to the agent here, so the frame
// closes Theia's own chat, sends Add to chat to the terminal's next turn and
// follows the active tab's run.
import { LayoutPriority, Orientation, SplitviewReact } from 'dockview-react'
import type { SplitviewApi, SplitviewReadyEvent } from 'dockview-react'
import { useEffect, useState } from 'react'
import { useShell } from '@/components/shell/shell-state'
import { useTerminalTabs } from '@/components/terminal/side-terminal'
import { TerminalScreen } from '@/components/terminal/terminal-screen'
import { IdeFrame } from './ide-frame'

const TERMINAL_HOST = 'theorem-ide-terminal'
const IDE = 'ide'
const TERMINAL = 'terminal'
/** The terminal's narrowest width, as the right drawer's. */
const TERMINAL_MIN = 380

function IdePanel() {
  return <IdeFrame terminal={TERMINAL_HOST} />
}

function TerminalPanel() {
  // Esc leaves the terminal for the editor; the terminal itself stays.
  const { tabs, active, onAction } = useTerminalTabs(true, () =>
    document.querySelector<HTMLIFrameElement>('iframe[title="IDE"]')?.focus(),
  )
  return (
    <div className="flex h-full min-w-0 flex-col border-s border-term-line bg-term pt-1.5">
      <TerminalScreen
        hostId={TERMINAL_HOST}
        tabbed
        tabs={tabs}
        active={active}
        onAction={onAction}
        closable={false}
      />
    </div>
  )
}

const components = { [IDE]: IdePanel, [TERMINAL]: TerminalPanel }

/**
 * Theia and the agent terminal side by side. The terminal keeps the width it
 * is dragged to, the right drawer's width; Theia takes the rest.
 */
export function IdeWorkbench() {
  const [split, setSplit] = useState<SplitviewApi>()

  const onReady = ({ api }: SplitviewReadyEvent) => {
    const width = Math.min(useShell.getState().sideWidth, api.width / 2)
    api.addPanel({
      id: IDE,
      component: IDE,
      size: api.width - width,
      minimumSize: 360,
      priority: LayoutPriority.High,
    })
    api.addPanel({
      id: TERMINAL,
      component: TERMINAL,
      size: width,
      minimumSize: TERMINAL_MIN,
      priority: LayoutPriority.Low,
    })
    setSplit(api)
  }

  useEffect(() => {
    const panel = split?.getPanel(TERMINAL)
    if (!panel) return
    const listener = panel.api.onDidDimensionsChange(({ width }) => {
      if (width > 0) useShell.getState().setSideWidth(Math.round(width))
    })
    return () => listener.dispose()
  }, [split])

  return (
    <SplitviewReact
      className="dockview-theme-theorem h-full w-full"
      orientation={Orientation.HORIZONTAL}
      proportionalLayout={false}
      components={components}
      onReady={onReady}
    />
  )
}
