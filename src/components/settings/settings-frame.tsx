// SOURCING: @tanstack/react-router Link (each section is a route), ui/icon-tile for row marks; the layout follows Twenty's settings (nav replaces the app panel, breadcrumb over a raised sheet, sections of bordered rows)
import { Link, useMatches } from '@tanstack/react-router'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Icon } from '@/components/icons'
import { IconTile } from '@/components/ui/icon-tile'
import { cn } from '@/lib/utils'
import { SETTINGS_GROUPS, settingsSection } from './sections'

const navItem =
  'flex h-8 items-center gap-2 rounded-md px-2 text-sm text-ink-muted outline-none transition-colors duration-100 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus data-[status=active]:bg-selected data-[status=active]:text-ink'

/** The settings nav: a way back to the conversation, then the sections by group. */
function SettingsNav() {
  return (
    <nav
      aria-label="Settings"
      className="flex w-(--spacing-sidebar) shrink-0 flex-col gap-4 overflow-y-auto px-2 py-3"
    >
      <Link to="/" className={navItem}>
        <Icon.X className="size-4" />
        Exit settings
      </Link>
      {SETTINGS_GROUPS.map(({ label, sections }) => (
        <div key={label} className="flex flex-col gap-0.5">
          <p className="px-2 pb-1 text-xs text-ink-faint">{label}</p>
          {sections.map(({ path, label: name, Mark }) => (
            <Link key={path} to={path} className={navItem}>
              <Mark className="size-4" />
              {name}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}

/** Which section the router is on, for the breadcrumb. */
function useCurrentSection() {
  return useMatches({
    select: (matches) => settingsSection(matches.at(-1)?.fullPath ?? ''),
  })
}

/** Settings' own shell: the nav where the app's panel was, and the open section on a raised sheet. */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const current = useCurrentSection()
  return (
    <div className="flex h-dvh bg-rail text-ink">
      <SettingsNav />
      <div className="flex min-w-0 flex-1 flex-col pe-1.5 pb-1.5">
        <header className="flex h-11 shrink-0 items-center gap-1.5 px-2 text-sm">
          {current && (
            <>
              <span className="text-ink-faint">{current.group}</span>
              <span className="text-ink-faint">/</span>
              <span>{current.label}</span>
            </>
          )}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-sheet shadow-sheet">
          <div className="mx-auto flex max-w-[680px] flex-col gap-8 px-6 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export function SettingsPage({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[20px] font-normal tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-ink-muted">{description}</p>
        )}
      </div>
      {children}
    </>
  )
}

/** A titled block of a settings page. */
export function SettingsSection({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-sm font-medium">{title}</h2>
          {description && (
            <p className="text-sm text-ink-muted">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** The bordered box a section's rows sit in. */
export function SettingsBox({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'divide-y divide-separator overflow-hidden rounded-lg border border-separator',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** One setting: its mark, what it is, and its control on the right. */
export function SettingsRow({
  Mark,
  title,
  description,
  children,
}: {
  Mark?: ComponentType<SVGProps<SVGSVGElement>>
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {Mark && (
        <IconTile size="lg">
          <Mark className="size-4 text-ink-muted" />
        </IconTile>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{title}</span>
        {description && (
          <span className="text-xs text-ink-muted">{description}</span>
        )}
      </div>
      {children}
    </div>
  )
}
