// SOURCING: coss ui popover, switch and scroll area, the owned Librarian mark from components/icons, date-fns for how long ago, lib/theorem/organization for the Librarian's status, history and Undo. Its behaviour (a quiet activity area with the reason and the undo one click away) is translated from mikecann/threadbear@78b77e1 (MIT, Mike Cann).
import { formatDistanceToNowStrict } from 'date-fns'
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from '@/components/coss/popover'
import { ScrollArea } from '@/components/coss/scroll-area'
import { Switch } from '@/components/coss/switch'
import { Icon } from '@/components/icons'
import { useState } from 'react'
import {
  useLibrarianControl,
  useLibrarianHistory,
  useUndoOrganize,
} from '@/lib/theorem/organization'
import type { LibrarianStatus, OrganizeEvent } from '@/lib/theorem/organization'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'

/** Events this close to the newest one read as one sitting. */
const SITTING_MS = 2 * 60_000

const TRIGGER_LABEL: Record<NonNullable<OrganizeEvent['trigger']>, string> = {
  first_message: 'after a first message',
  turn_completed: 'after a finished turn',
  moved: 'after a thread moved',
  new_repo: 'after a new repository turned up',
  catch_up: 'on a catch-up pass',
  placement: 'when someone placed the thread',
}

const ago = (atMs: number) =>
  Date.now() - atMs < 60_000
    ? 'just now'
    : `${formatDistanceToNowStrict(atMs)} ago`

/** "3 threads organized just now": what the last sitting did, as one line. */
export function sittingHeadline(recent: readonly OrganizeEvent[]) {
  const [newest] = recent
  if (!newest) return 'Nothing filed yet'
  const threads = new Set(
    recent
      .filter(
        (event) =>
          newest.atMs - event.atMs < SITTING_MS &&
          event.threadId &&
          event.kind !== 'undone',
      )
      .map((event) => event.threadId),
  )
  const when = ago(newest.atMs)
  if (threads.size === 0) return `Organized ${when}`
  return `${threads.size} ${threads.size === 1 ? 'thread' : 'threads'} organized ${when}`
}

function Why({ event }: { event: OrganizeEvent }) {
  const { evidence, trigger, why, actor } = event
  return (
    <Popover>
      <PopoverTrigger className="rounded-sm text-ink-muted underline-offset-2 outline-none hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-focus">
        Why?
      </PopoverTrigger>
      <PopoverPopup side="top" align="start" className="w-64 text-sm">
        <p className="text-ink">{why || 'No reason was recorded.'}</p>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          {actor === 'librarian'
            ? 'The Librarian'
            : actor === 'agent'
              ? 'The agent'
              : 'You'}{' '}
          {trigger ? `decided ${TRIGGER_LABEL[trigger]}` : 'decided this'}
          {evidence
            ? `, from ${evidence.messageIds.length} ${evidence.messageIds.length === 1 ? 'message' : 'messages'} (${evidence.inputChars.toLocaleString()} characters)${evidence.model ? ` with ${evidence.model}` : ''}`
            : ''}
          .
        </p>
      </PopoverPopup>
    </Popover>
  )
}

function UndoButton({ event }: { event: OrganizeEvent }) {
  const undo = useUndoOrganize()
  if (!event.reversible || event.undoneByEventId) return null
  return (
    <button
      type="button"
      disabled={undo.isPending}
      title={undo.error ? describeError(undo.error) : undefined}
      onClick={() => undo.mutate(event.eventId)}
      className={cn(
        'rounded-sm underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60',
        undo.error ? 'text-error-ink' : 'text-ink-muted hover:text-ink',
      )}
    >
      {undo.error ? 'Try undo again' : 'Undo'}
    </button>
  )
}

/** Everything the Librarian has done, and the switches for what it may do. */
function History({ librarian }: { librarian: LibrarianStatus }) {
  const [open, setOpen] = useState(false)
  const history = useLibrarianHistory({}, open)
  const control = useLibrarianControl()
  const events = history.data?.items ?? librarian.recent
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Librarian history"
        className="flex size-5 shrink-0 items-center justify-center rounded-sm text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus data-popup-open:bg-hover"
      >
        <Icon.History className="size-3.5" />
      </PopoverTrigger>
      <PopoverPopup side="right" align="end" className="w-80 text-sm">
        <div className="flex flex-col gap-2 pb-2">
          <label className="flex items-center justify-between gap-2">
            Organize threads
            <Switch
              checked={!librarian.paused}
              onCheckedChange={(on) => control.mutate({ paused: !on })}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-ink-muted">
            Project membership
            <Switch
              checked={librarian.jobs.membership.enabled}
              onCheckedChange={(enabled) =>
                control.mutate({
                  jobs: {
                    membership: { ...librarian.jobs.membership, enabled },
                  },
                })
              }
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-ink-muted">
            Summaries and project state
            <Switch
              checked={librarian.jobs.summary.enabled}
              onCheckedChange={(enabled) =>
                control.mutate({
                  jobs: { summary: { ...librarian.jobs.summary, enabled } },
                })
              }
            />
          </label>
        </div>
        <ScrollArea className="max-h-72 border-t border-separator">
          <ol className="flex flex-col gap-3 py-2 pe-2">
            {events.map((event) => (
              <li key={event.eventId} className="flex flex-col gap-0.5">
                <p
                  className={cn(
                    'text-sm',
                    event.undoneByEventId && 'text-ink-muted line-through',
                  )}
                >
                  {event.text}
                </p>
                {event.why && (
                  <p className="text-xs text-ink-muted">{event.why}</p>
                )}
                <p className="flex gap-2 text-xs text-ink-muted">
                  {ago(event.atMs)}
                  <UndoButton event={event} />
                </p>
              </li>
            ))}
            {events.length === 0 && (
              <li className="text-xs text-ink-muted">Nothing filed yet.</li>
            )}
          </ol>
        </ScrollArea>
      </PopoverPopup>
    </Popover>
  )
}

/** The Librarian's corner of the sidebar: what it last did, why, and how to take it back. */
export function LibrarianFooter({ librarian }: { librarian: LibrarianStatus }) {
  const control = useLibrarianControl()
  const [newest] = librarian.recent
  const line =
    librarian.state === 'working'
      ? librarian.queued > 1
        ? `Reading ${librarian.queued} threads`
        : 'Reading a thread'
      : librarian.state === 'paused'
        ? 'The Librarian is paused'
        : librarian.state === 'off'
          ? (librarian.offReason ?? 'The Librarian is off')
          : sittingHeadline(librarian.recent)
  return (
    <section
      aria-label="Librarian"
      className="flex shrink-0 flex-col gap-1.5 border-t border-separator px-4 py-2.5 text-sm"
    >
      <div className="flex items-center gap-2">
        <Icon.Librarian
          aria-hidden
          className={cn(
            'size-4 shrink-0 text-ink-muted',
            librarian.state === 'working' &&
              'animate-pulse motion-reduce:animate-none',
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="leading-tight font-medium">Librarian</p>
          <p
            aria-live="polite"
            className="truncate text-xs leading-tight text-ink-muted"
          >
            {line}
          </p>
        </div>
        <History librarian={librarian} />
      </div>
      {librarian.state === 'paused' ? (
        <button
          type="button"
          onClick={() => control.mutate({ paused: false })}
          className="ms-6 self-start rounded-sm text-xs text-ink-muted underline-offset-2 outline-none hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-focus"
        >
          Resume
        </button>
      ) : (
        newest &&
        librarian.state !== 'off' && (
          <div className="flex items-center gap-1.5 ps-6 text-xs">
            <p className="min-w-0 flex-1 truncate" title={newest.text}>
              {newest.text}
            </p>
            <Why event={newest} />
            {newest.reversible && !newest.undoneByEventId && (
              <span aria-hidden className="text-separator">
                |
              </span>
            )}
            <UndoButton event={newest} />
          </div>
        )
      )}
    </section>
  )
}
