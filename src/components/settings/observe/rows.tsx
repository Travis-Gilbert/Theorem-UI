// SOURCING: the shell's tokens (styles.css); sits inside the settings frame's SettingsBox. Rows of a name and its reading, after the key and value rows of fal's request page as captured on Mobbin. No code from either.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A count or total set level with a section's title. */
export function Count({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 text-xs text-ink-muted tabular-nums">
      {children}
    </span>
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
