// SOURCING: date-fns (clock times), @tanstack/react-router Link (a turn's page), the settings page primitives
import { Link } from '@tanstack/react-router'
import { format, isSameDay } from 'date-fns'
import type { ReactNode } from 'react'
import { Icon } from '@/components/icons'
import { Button, buttonVariants } from '@/components/ui/button'
import { describeError, hasStatus, isSignedOut } from '@/lib/theorem/client'
import { shortRunId } from '@/lib/theorem/observe'
import type { ObservedRun } from '@/lib/theorem/observe'
import { signInHref } from '@/lib/theorem/sign-in'
import { cn } from '@/lib/utils'
import { Notice, State } from '../settings-page'
import type { Tone } from '../settings-page'

/** A moment as a clock time, with its date when it is not today. */
export function clock(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  const at = new Date(ms)
  return format(at, isSameDay(at, new Date()) ? 'HH:mm:ss' : 'MMM d, HH:mm:ss')
}

/** Table cells share one rhythm: 28px rows, numbers set in tabular figures. */
export const th =
  'h-7 px-3 text-start text-xs font-normal whitespace-nowrap text-ink-muted'
export const td = 'h-7 px-3 py-0 whitespace-nowrap'
export const num = 'text-end tabular-nums'

/** The link from a row to its turn's trace. */
export function TurnLink({ runId }: { runId: string }) {
  return (
    <Link
      to="/settings/observe/runs/$runId"
      params={{ runId }}
      title={runId}
      className="rounded-sm font-mono text-xs text-link underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {shortRunId(runId)}
    </Link>
  )
}

const OUTCOME: Record<
  NonNullable<ObservedRun['outcome']>,
  { tone: Tone; label: string }
> = {
  completed: { tone: 'ok', label: 'Completed' },
  failed: { tone: 'bad', label: 'Failed' },
  cancelled: { tone: 'quiet', label: 'Cancelled' },
}

/** How a turn ended, or that it has not. */
export function Outcome({
  outcome,
}: {
  outcome: ObservedRun['outcome'] | undefined
}) {
  if (!outcome) return <State tone="attention">Running</State>
  const { tone, label } = OUTCOME[outcome]
  return <State tone={tone}>{label}</State>
}

/** When the page last read the node, and a way to read it again now. */
export function Freshness({
  readAtMs,
  reading,
  paused,
  onRead,
}: {
  readAtMs: number | undefined
  reading: boolean
  /** Reads have stopped: the turn ended, so its trace will not change. */
  paused?: boolean
  onRead: () => void
}) {
  return (
    <>
      <span className="text-xs text-ink-muted tabular-nums" aria-live="off">
        {readAtMs === undefined
          ? 'Not read yet'
          : `Read ${clock(readAtMs)}${paused ? '' : ', again every 5 s'}`}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onRead}
        disabled={reading}
        aria-label="Read again now"
      >
        <Icon.Refresh className={cn('size-3.5', reading && 'opacity-50')} />
        Read again
      </Button>
    </>
  )
}

/** Why the node gave no answer, and what the person can do about it. */
export function ReadFailure({
  error,
  stale,
  onRetry,
}: {
  error: unknown
  /** The page still shows an earlier read. */
  stale?: number
  onRetry: () => void
}): ReactNode {
  if (isSignedOut(error))
    return (
      <Notice
        title="Sign in to see what the node observed"
        action={
          <a href={signInHref()} className={buttonVariants({ size: 'sm' })}>
            Sign in
          </a>
        }
      />
    )
  const title = hasStatus(error, 403)
    ? 'This identity cannot read observations'
    : hasStatus(error, 404)
      ? 'No such turn'
      : stale === undefined
        ? 'The node did not answer'
        : `The node did not answer; this is what it said at ${clock(stale)}`
  return (
    <Notice
      title={title}
      action={
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {describeError(error)}
    </Notice>
  )
}
