// SOURCING: @vscode/codicons (the icons Theia's status bar entries name, drawn as Theia draws them), the docked frame's entries from ide-page's store and runStatusBarItem over the frame link (follow.ts), @tanstack/react-router Link (Settings), the shell's agent terminal switch
//
// The IDE page's one status bar, along the bottom of the whole sheet: the
// agent terminal and Settings, which the sidebar's foot had, then Theia's own
// entries as its status bar would show them. A click does what it does in
// Theia, so a quick pick or dialog it opens shows in the IDE.
import '@vscode/codicons/dist/codicon.css'
import { Link } from '@tanstack/react-router'
import { Icon } from '@/components/icons'
import { useShell } from '@/components/shell/shell-state'
import { cn } from '@/lib/utils'
import type { StatusBarItem } from '../../../ide/theia-extensions/theorem-workspace/src/common/ide-bridge'
import { useFollow } from './follow'
import { useIdePage } from './ide-page'

const ENTRY =
  'flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs whitespace-nowrap text-ink-muted outline-none focus-visible:outline-2 focus-visible:outline-focus'
const CLICKABLE = 'hover:bg-hover hover:text-ink'

function Entry({ item }: { item: StatusBarItem }) {
  const content = item.label.map((part, index) =>
    typeof part === 'string' ? (
      <span key={index} className="truncate">
        {part.trim()}
      </span>
    ) : (
      <span
        key={index}
        aria-hidden
        className={cn(
          'codicon text-[14px]',
          `codicon-${part.icon}`,
          part.spin && 'codicon-modifier-spin',
        )}
      />
    ),
  )
  const className = cn(
    ENTRY,
    item.active && 'bg-selected text-ink',
    item.tone === 'error' && 'text-error-ink',
    item.tone === 'warning' && 'text-warning-foreground',
    item.tone === 'prominent' && 'text-ink',
  )
  if (!item.clickable)
    return (
      <span title={item.tooltip} aria-label={item.name} className={className}>
        {content}
      </span>
    )
  return (
    <button
      type="button"
      title={item.tooltip}
      aria-label={item.name}
      aria-pressed={item.active}
      onClick={() =>
        void useFollow.getState().ide?.runStatusBarItem(item.id).catch(() => undefined)
      }
      className={cn(className, CLICKABLE)}
    >
      {content}
    </button>
  )
}

export function IdeStatusBar() {
  const statusBar = useIdePage((s) => s.statusBar)
  const terminalOpen = useShell((s) => s.terminalOpen)
  return (
    <footer
      aria-label="Status bar"
      className="flex h-8 shrink-0 items-center gap-0.5 border-t border-separator px-1.5"
    >
      <button
        type="button"
        aria-label="Agent terminal"
        aria-pressed={terminalOpen}
        title="Agent terminal (ctrl+`)"
        onClick={() => useShell.getState().setTerminalOpen(!terminalOpen)}
        className={cn(ENTRY, CLICKABLE, 'aria-pressed:text-ink')}
      >
        <Icon.Terminal className="size-4" strokeWidth={1.75} />
      </button>
      <Link
        to="/settings"
        aria-label="Settings"
        title="Settings"
        className={cn(ENTRY, CLICKABLE)}
      >
        <Icon.Settings className="size-4" />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        {statusBar?.left.map((item) => <Entry key={item.id} item={item} />)}
      </div>
      <div className="flex min-w-0 items-center gap-0.5 overflow-hidden">
        {statusBar?.right.map((item) => <Entry key={item.id} item={item} />)}
      </div>
    </footer>
  )
}
