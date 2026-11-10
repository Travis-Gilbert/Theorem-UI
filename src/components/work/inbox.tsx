// SOURCING: coss ui SegmentedControl, Menu and Empty, @tanstack/react-hotkeys for keys scoped to the focused list, ./date-picker (react-day-picker) for snoozing; behaviour after Linear's inbox. The entries are what the source notified (assigned, review requested, mentioned, check failed), not messages
import { format, parseISO } from 'date-fns'
import { useHotkeys } from '@tanstack/react-hotkeys'
import { useMemo, useState } from 'react'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/coss/empty'
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/coss/menu'
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/coss/segmented-control'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import { DatePicker, snoozePresets } from './date-picker'
import { WorkDetail } from './item-detail'
import { fromControl } from './keys'
import { ActorAvatar, RelativeTime, StatusMark, actorName } from './marks'
import { Notice, useNotice } from './notice'
import { useInboxAction, useInboxBulk, useWorkInbox } from './queries'
import { useWorkSource } from './source'
import type { InboxEntry, InboxReason, InboxState } from './contract'

const STATES: Array<{ value: InboxState; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'snoozed', label: 'Snoozed' },
  { value: 'archived', label: 'Archived' },
]

const REASON: Record<InboxReason, { icon: keyof typeof Icon; label: string }> = {
  assigned: { icon: 'Pin', label: 'Assigned to you' },
  review_requested: { icon: 'Eye', label: 'Review requested' },
  mentioned: { icon: 'Chat', label: 'Mentioned you' },
  comment: { icon: 'Conversation', label: 'New comment' },
  status_changed: { icon: 'Check', label: 'Status changed' },
  check_failed: { icon: 'Stop', label: 'Check failed' },
  subscribed: { icon: 'Bell', label: 'Subscribed' },
  investigation: { icon: 'Agent', label: 'Investigation' },
}

const EMPTY: Record<InboxState, string> = {
  all: 'Nothing has come in yet.',
  unread: 'You are all caught up.',
  snoozed: 'Nothing is snoozed.',
  archived: 'Nothing is archived.',
}

const rowId = (entry: InboxEntry) => `work-inbox-${entry.id}`

function Entry({
  entry,
  focused,
  active,
  state,
  onOpen,
  onToggleRead,
  onSnooze,
  onArchive,
}: {
  entry: InboxEntry
  focused: boolean
  active: boolean
  state: InboxState
  onOpen: () => void
  onToggleRead: () => void
  onSnooze: (anchor: Element) => void
  onArchive: () => void
}) {
  const unread = !entry.readAt
  const Reason = Icon[REASON[entry.reason].icon]
  const archived = !!entry.archivedAt
  return (
    <div
      id={rowId(entry)}
      role="option"
      aria-selected={active}
      data-entry={entry.id}
      onClick={onOpen}
      className={cn(
        'group/entry flex cursor-default items-center gap-2.5 border-b border-separator/60 px-3 py-2',
        active ? 'bg-selected' : 'hover:bg-hover',
        focused &&
          'group-focus-visible/inbox:outline-2 group-focus-visible/inbox:-outline-offset-2 group-focus-visible/inbox:outline-focus',
      )}
    >
      <span
        aria-label={unread ? 'Unread' : undefined}
        className={cn('size-2 shrink-0 rounded-full', unread && 'bg-redwood')}
      />
      <span
        title={REASON[entry.reason].label}
        className="grid size-6 shrink-0 place-items-center text-ink-faint"
      >
        <Reason className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <StatusMark status={entry.item.status} />
          <span className="shrink-0 text-xs tabular-nums text-ink-faint">
            {entry.item.key}
          </span>
          <span
            className={cn(
              'truncate text-sm',
              unread ? 'font-medium text-ink' : 'text-ink-muted',
            )}
          >
            {entry.item.title}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
          {entry.actor && <ActorAvatar actor={entry.actor} size="sm" />}
          <span className="truncate">
            {entry.actor && (
              <span className="font-medium">{actorName(entry.actor)} </span>
            )}
            {entry.summary}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="flex items-center opacity-0 group-focus-within/entry:opacity-100 group-hover/entry:opacity-100">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={unread ? 'Mark as read' : 'Mark as unread'}
            title={unread ? 'Mark as read' : 'Mark as unread'}
            onClick={(event) => {
              event.stopPropagation()
              onToggleRead()
            }}
          >
            <Icon.Eye />
          </Button>
          {!archived && (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Snooze"
              title="Snooze"
              onClick={(event) => {
                event.stopPropagation()
                onSnooze(event.currentTarget)
              }}
            >
              <Icon.Later />
            </Button>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={archived ? 'Move back to the inbox' : 'Archive'}
            title={archived ? 'Move back to the inbox' : 'Archive'}
            onClick={(event) => {
              event.stopPropagation()
              onArchive()
            }}
          >
            <Icon.Archive />
          </Button>
        </span>
        {state === 'snoozed' && entry.snoozedUntil ? (
          <span className="text-xs text-ink-faint tabular-nums">
            {format(parseISO(entry.snoozedUntil), 'MMM d')}
          </span>
        ) : (
          <RelativeTime
            iso={entry.createdAt}
            className="w-7 text-end text-xs text-ink-faint"
          />
        )}
      </div>
    </div>
  )
}

function InboxList({
  initialState = 'all',
  selectedId,
  onOpen,
}: {
  initialState?: InboxState
  selectedId?: string
  onOpen?: (itemId: string) => void
}) {
  const source = useWorkSource()
  const [state, setState] = useState<InboxState>(initialState)
  const inbox = useWorkInbox(state)
  const act = useInboxAction()
  const bulk = useInboxBulk()
  const { notice, say, clear } = useNotice()
  const [list, setList] = useState<HTMLDivElement | null>(null)
  const [focusId, setFocusId] = useState<string>()
  const [snoozing, setSnoozing] = useState<{ entry: InboxEntry; anchor: Element }>()

  const entries = useMemo(
    () => inbox.data?.pages.flatMap((p) => p.entries) ?? [],
    [inbox.data],
  )
  const unreadCount = inbox.data?.pages[0]?.unreadCount
  const focusAt = entries.findIndex((e) => e.id === focusId)
  const focused = entries[focusAt]

  const move = (delta: 1 | -1) => {
    const at = focusAt < 0 ? (delta > 0 ? 0 : entries.length - 1) : focusAt + delta
    const next = entries[Math.min(entries.length - 1, Math.max(0, at))]
    if (!next) return
    setFocusId(next.id)
    list
      ?.querySelector(`[data-entry="${CSS.escape(next.id)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }
  const open = (entry: InboxEntry) => {
    setFocusId(entry.id)
    if (!entry.readAt)
      act.mutate({ entry, action: 'read' }, { onError: say })
    onOpen?.(entry.itemId)
  }
  const toggleRead = (entry: InboxEntry) =>
    act.mutate({ entry, action: entry.readAt ? 'unread' : 'read' }, { onError: say })
  const archive = (entry: InboxEntry) =>
    act.mutate(
      { entry, action: entry.archivedAt ? 'unarchive' : 'archive' },
      { onError: say },
    )
  const snoozeAnchor = (entry: InboxEntry) =>
    list?.querySelector(`[data-entry="${CSS.escape(entry.id)}"]`) ?? list

  const guard = (run: () => void) => (event: KeyboardEvent) => {
    if (!fromControl(event, list)) run()
  }
  useHotkeys(
    [
      { hotkey: 'ArrowDown', callback: guard(() => move(1)) },
      { hotkey: 'ArrowUp', callback: guard(() => move(-1)) },
      { hotkey: 'Enter', callback: guard(() => focused && open(focused)) },
      { hotkey: 'U', callback: guard(() => focused && toggleRead(focused)) },
      { hotkey: 'E', callback: guard(() => focused && archive(focused)) },
      {
        hotkey: 'S',
        callback: guard(() => {
          const anchor = focused && snoozeAnchor(focused)
          if (focused && anchor && !focused.archivedAt)
            setSnoozing({ entry: focused, anchor })
        }),
      },
    ],
    { target: list, preventDefault: true, enabled: !snoozing },
  )

  if (!source.listInbox)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No inbox</EmptyTitle>
          <EmptyDescription>This source has no notifications.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-separator px-3 py-2">
        <SegmentedControl aria-label="Show" size="sm">
          {STATES.map((s) => (
            <SegmentedControlItem
              key={s.value}
              size="sm"
              aria-pressed={state === s.value}
              data-pressed={state === s.value ? '' : undefined}
              onClick={() => setState(s.value)}
            >
              {s.label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
        {unreadCount !== undefined && (
          <span className="text-xs text-ink-muted tabular-nums">
            {unreadCount} unread
          </span>
        )}
        <span className="flex-1" />
        {source.actOnInboxBulk && (
          <Menu>
            <MenuTrigger
              render={
                <Button size="icon-xs" variant="ghost" aria-label="Inbox actions" />
              }
            >
              <Icon.More />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-44">
              <MenuItem
                disabled={!unreadCount || bulk.isPending}
                onClick={() => bulk.mutate('read_all', { onError: say })}
              >
                Mark all as read
              </MenuItem>
              <MenuItem
                disabled={bulk.isPending}
                onClick={() => bulk.mutate('archive_read', { onError: say })}
              >
                Archive read
              </MenuItem>
            </MenuPopup>
          </Menu>
        )}
      </div>
      <Notice notice={notice} onClear={clear} />

      {inbox.isPending ? (
        <div className="flex flex-col gap-px p-2" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : inbox.isError && !inbox.data ? (
        <div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm">
          <span className="text-error-ink">{describeError(inbox.error)}</span>
          <Button size="sm" variant="outline" onClick={() => void inbox.refetch()}>
            Try again
          </Button>
        </div>
      ) : !entries.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{EMPTY[state]}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          ref={setList}
          role="listbox"
          tabIndex={0}
          aria-label="Inbox"
          aria-activedescendant={focused ? rowId(focused) : undefined}
          className="group/inbox min-h-0 flex-1 overflow-y-auto outline-none"
        >
          {entries.map((entry) => (
            <Entry
              key={entry.id}
              entry={entry}
              focused={entry.id === focusId}
              active={entry.itemId === selectedId}
              state={state}
              onOpen={() => open(entry)}
              onToggleRead={() => toggleRead(entry)}
              onSnooze={(anchor) => setSnoozing({ entry, anchor })}
              onArchive={() => archive(entry)}
            />
          ))}
          {inbox.hasNextPage && (
            <div className="flex justify-center p-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={inbox.isFetchingNextPage}
                onClick={() => void inbox.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      )}

      <DatePicker
        anchor={snoozing?.anchor ?? null}
        onClose={() => setSnoozing(undefined)}
        presets={snoozePresets()}
        onPick={(date) =>
          snoozing &&
          date &&
          act.mutate(
            { entry: snoozing.entry, action: 'snooze', until: date.toISOString() },
            { onError: say },
          )
        }
      />
    </div>
  )
}

/**
 * What came in for the person: entries with why they are here, who caused
 * them and how long ago, to read, snooze or archive. Choosing an entry marks it
 * read and opens its item through `onOpen`; with `twoPane` the item opens
 * beside the list instead.
 */
export function WorkInbox({
  initialState,
  selectedId,
  onOpen,
  twoPane = false,
}: {
  /** The filter it opens on; the person changes it from there. */
  initialState?: InboxState
  selectedId?: string
  onOpen?: (itemId: string) => void
  twoPane?: boolean
}) {
  const [local, setLocal] = useState<string>()
  const selected = selectedId ?? local
  const open = (itemId: string) => {
    setLocal(itemId)
    onOpen?.(itemId)
  }
  if (!twoPane) return <InboxList initialState={initialState} selectedId={selected} onOpen={open} />
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-96 max-w-[45%] shrink-0 flex-col border-e border-separator">
        <InboxList initialState={initialState} selectedId={selected} onOpen={open} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <WorkDetail key={selected} itemId={selected} onOpen={open} />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Select an entry</EmptyTitle>
              <EmptyDescription>Its item opens here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  )
}
