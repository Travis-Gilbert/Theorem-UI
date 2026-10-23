// SOURCING: lucide-react (the status glyphs) and the app's Tailwind tokens.
// How a block says where it stands: computing, done, failed, waiting for Run.
import { CircleAlert, CircleCheck, CircleDashed, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import type { CellState } from '@/lib/blocks/runtime'
import { cn } from '@/lib/utils'

const STATUS = {
  pending: { label: 'Running', Icon: LoaderCircle, spin: true },
  ok: { label: 'Up to date', Icon: CircleCheck, spin: false },
  error: { label: 'Failed', Icon: CircleAlert, spin: false },
  idle: { label: 'Waiting for Run', Icon: CircleDashed, spin: false },
  stale: { label: 'Changed since it ran', Icon: CircleDashed, spin: false },
} as const

/** A block's status as a small label. */
export function BlockStatus({ state }: { state: CellState | null }) {
  if (!state) return null
  const { label, Icon, spin } = STATUS[state.status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        state.status === 'error' ? 'text-error-ink' : 'text-ink-faint',
      )}
      aria-live="polite"
    >
      <Icon className={cn('size-3', spin && 'animate-spin')} aria-hidden />
      {label}
    </span>
  )
}

/** A line about a block: why it is not running, or what went wrong. */
export function BlockMessage({
  children,
  tone = 'quiet',
}: {
  children: ReactNode
  tone?: 'quiet' | 'error'
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'px-3 py-2 text-xs whitespace-pre-wrap',
        tone === 'error'
          ? 'bg-error-container text-error-ink'
          : 'text-ink-muted',
      )}
    >
      {children}
    </div>
  )
}

/** Whether a block's Run button runs it, or runs it again. */
export const runLabel = (state: CellState | null) =>
  state?.status === 'idle' || state?.status === 'stale' ? 'Run' : 'Run again'
