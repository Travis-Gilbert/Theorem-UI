// SOURCING: @tanstack/react-router Link (breadcrumb), the shell's tokens (styles.css). Anatomy after Twenty's settings as captured on Mobbin: a breadcrumb, then titled sections whose content is a bordered group of rows. No Twenty code.
import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ExitSettings } from './settings-shell'

export type Crumb = { label: string; link?: LinkProps }

/** One settings page: where it is, what it is, then its sections. */
export function SettingsPage({
  trail,
  title,
  description,
  actions,
  wide = false,
  children,
}: {
  trail: Array<Crumb>
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** A page of tables takes a wider measure than a page of fields. */
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col gap-8 px-4 py-5 md:px-10 md:py-8',
        wide ? 'max-w-[1080px]' : 'max-w-[840px]',
      )}
    >
      <header className="flex flex-col gap-3">
        <ExitSettings className="flex h-7 items-center gap-1.5 self-start rounded-md pe-2 text-sm text-ink-muted outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-focus md:hidden" />
        <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            {trail.map(({ label, link }, index) => (
              <Fragment key={label}>
                {index > 0 && (
                  <li aria-hidden="true" className="text-ink-faint">
                    /
                  </li>
                )}
                <li>
                  {link ? (
                    <Link
                      {...link}
                      className="rounded-sm outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span
                      aria-current={
                        index === trail.length - 1 ? 'page' : undefined
                      }
                      className={cn(index === trail.length - 1 && 'text-ink')}
                    >
                      {label}
                    </span>
                  )}
                </li>
              </Fragment>
            ))}
          </ol>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="font-heading text-[26px] leading-tight font-normal tracking-tight">
              {title}
            </h1>
            {description && (
              <p className="mt-1 max-w-(--spacing-reading) text-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-3">{actions}</div>
          )}
        </div>
      </header>
      {children}
    </div>
  )
}

/** A titled part of a page. `aside` sits level with the title. */
export function Section({
  title,
  description,
  aside,
  children,
}: {
  title: string
  description?: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium">{title}</h2>
          {description && (
            <p className="mt-0.5 max-w-(--spacing-reading) text-sm text-ink-muted">
              {description}
            </p>
          )}
        </div>
        {aside && (
          <div className="shrink-0 text-xs text-ink-muted tabular-nums">
            {aside}
          </div>
        )}
      </div>
      {children}
    </section>
  )
}

/** The bordered group a section's rows sit in. */
export function RowGroup({
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

/** A named value. The label column is fixed so values line up down a group. */
export function Row({
  label,
  children,
}: {
  label: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid min-h-7 grid-cols-1 items-baseline gap-x-6 gap-y-0.5 px-3 py-1.5 text-sm sm:grid-cols-[168px_minmax(0,1fr)]">
      <div className="text-ink-muted">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** A line that stands where rows would be when there are none to show. */
export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="px-3 py-2.5 text-sm text-ink-muted">{children}</p>
}

export type Tone = 'ok' | 'attention' | 'bad' | 'quiet'

const MARK: Record<Tone, string> = {
  ok: 'bg-teal',
  attention: 'bg-ochre',
  bad: 'bg-destructive',
  quiet: 'bg-ink-faint',
}

/**
 * A state as a coloured mark beside its word. The word carries the meaning
 * in the page's ink; the mark only repeats it.
 */
export function State({
  tone,
  hollow = false,
  children,
}: {
  tone: Tone
  /** A state that was not observed: an outline, not a filled mark. */
  hollow?: boolean
  children: ReactNode
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        aria-hidden="true"
        className={cn(
          'size-2 shrink-0 translate-y-[-0.5px] rounded-full',
          hollow ? 'border border-ink-faint' : MARK[tone],
        )}
      />
      <span>{children}</span>
    </span>
  )
}

/** A page-level message: the node refused, or could not be reached. */
export function Notice({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-separator px-3 py-2.5 text-sm"
    >
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {children && <p className="mt-0.5 text-ink-muted">{children}</p>}
      </div>
      {action}
    </div>
  )
}
