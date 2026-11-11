// SOURCING: @tanstack/react-router Link (each settings page is a route), the shell's rail and sheet surfaces (styles.css), the shell's remembered conversation (zustand). Anatomy after Twenty's settings as captured on Mobbin: the app's navigation gives way to a grouped settings list with the way out at its head. No Twenty code.
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Icon } from '@/components/icons'
import { useShell } from '@/components/shell/shell-state'

/** The settings pages that exist, grouped as the list shows them. */
export const SETTINGS_NAV = [
  {
    group: 'Workspace',
    items: [{ to: '/settings/observe', label: 'Observe', Mark: Icon.Observe }],
  },
] as const

const navRow =
  'flex h-7 items-center gap-2 rounded-md px-2 text-sm text-ink-muted outline-none transition-colors duration-100 hover:bg-ink/8 hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus aria-[current=page]:bg-ink/8 aria-[current=page]:text-ink'

/** Back to the conversation last open, or a new one. */
export function ExitSettings({ className }: { className?: string }) {
  const threadId = useShell((s) => s.chatThreadId)
  const content = (
    <>
      <Icon.Previous className="size-4" />
      Exit settings
    </>
  )
  return threadId ? (
    <Link to="/c/$threadId" params={{ threadId }} className={className}>
      {content}
    </Link>
  ) : (
    <Link to="/" className={className}>
      {content}
    </Link>
  )
}

/**
 * Settings takes the whole window: the list of pages sits on the rail's
 * surface where the app's navigation was, and the page is the sheet. On a
 * phone the list folds away and the page's own header carries the way out.
 */
export function SettingsShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-rail text-ink [--sheet-h:calc(100dvh-2*var(--sheet-inset))] [--sheet-inset:3px]">
      <nav
        aria-label="Settings"
        className="hidden w-60 shrink-0 flex-col gap-4 px-2 py-3 md:flex"
      >
        <ExitSettings className={`${navRow} font-medium text-ink`} />
        {SETTINGS_NAV.map(({ group, items }) => (
          <div key={group} className="flex flex-col gap-px">
            <p className="px-2 pb-1 text-xs text-ink-faint">{group}</p>
            {items.map(({ to, label, Mark }) => (
              <Link key={to} to={to} className={navRow}>
                <Mark className="size-4" strokeWidth={1.75} />
                {label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="relative my-(--sheet-inset) me-(--sheet-inset) min-w-0 flex-1 max-md:ms-(--sheet-inset)">
        <div aria-hidden="true" className="lift-glow" />
        <main className="sheet on-sheet relative h-full overflow-y-auto rounded-xl bg-sheet shadow-sheet">
          {children}
        </main>
      </div>
    </div>
  )
}
