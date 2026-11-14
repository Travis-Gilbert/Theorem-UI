// SOURCING: none. Maps Theorem's attention feed (@theoremharness/sdk chat.attention, spec docs/plans/phone-inbox/SPEC-ATTENTION-FEED.md in Theorem) to rows. The server decides what is listed and when it leaves; nothing here is derived, inferred or kept.
import { formatDistanceStrict } from 'date-fns'
import type { Theorem } from '@theoremharness/sdk'
import { routeOf } from '../chat/selection'
import type { Tone } from '@/ui/status'

/** An SF Symbol name, as the SwiftUI Image in the list takes it. */
export type Glyph =
  'hand.raised.fill' | 'questionmark' | 'checkmark' | 'exclamationmark' | 'pause.fill' | 'stop.fill'

export type InboxRow = {
  id: string
  section: 'needs_you' | 'updates'
  /** The bold line: what is asked, or the conversation an update belongs to. */
  title: string
  /** Who did what, then where: "Theo asked for your approval · Compare the drafts". */
  line: string
  status: { tone: Tone; label: string }
  /** The badge on Theo's avatar, which says what kind of item this is at a glance. */
  glyph: Glyph
  atMs: number
  /** Where the item lives: the conversation the run belongs to. */
  destination: ReturnType<typeof routeOf>
  /** Opening an update is the person looking at it, which is what makes it leave. */
  seenThreadId?: string
  /** Updates can be set aside with Later; a question or approval does not wait. */
  snoozeThreadId?: string
  hint: string
}

export type InboxSections = { needsYou: InboxRow[]; updates: InboxRow[] }

const EMPTY_TITLE = 'New conversation'

const nonEmpty = (value: string | undefined) => (value?.trim() ? value.trim() : undefined)
const joined = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ')

/**
 * One feed item as a row, or nothing when the item is one this app does not
 * know how to open. A kind or source added to Theorem later is ignored rather
 * than sent to a guessed destination.
 */
export function rowOf(item: Theorem.ChatAttentionItem): InboxRow | undefined {
  if ((item.source.kind as string) !== 'thread') return undefined
  const conversation = nonEmpty(item.title) ?? EMPTY_TITLE
  const base = {
    id: item.id,
    atMs: item.atMs,
    destination: routeOf({ kind: 'theorem', threadId: item.source.threadId }),
  }
  switch (item.kind) {
    case 'approval':
      return {
        ...base,
        section: 'needs_you',
        title: nonEmpty(item.detail) ?? 'Theo needs your approval',
        line: joined('Theo asked for your approval', conversation),
        status: { tone: 'attention', label: 'Needs your decision' },
        glyph: 'hand.raised.fill',
        hint: 'Opens the conversation, where you review the request and decide',
      }
    case 'review':
      return {
        ...base,
        section: 'needs_you',
        title: nonEmpty(item.detail) ?? 'Theo needs you to choose',
        line: joined('Theo asked a question', conversation),
        status: { tone: 'attention', label: 'Needs your answer' },
        glyph: 'questionmark',
        hint: 'Opens the conversation, where you answer',
      }
    case 'completed':
      return updateRow(base, item, conversation, 'Theo finished', 'checkmark', {
        tone: 'success',
        label: 'Finished',
      })
    case 'failed':
      return updateRow(base, item, conversation, 'Theo hit an error', 'exclamationmark', {
        tone: 'error',
        label: 'Failed',
      })
    case 'interrupted':
      return updateRow(base, item, conversation, 'Theo was interrupted', 'pause.fill', {
        tone: 'error',
        label: 'Interrupted',
      })
    case 'stopped':
      return updateRow(base, item, conversation, 'Run stopped', 'stop.fill', {
        tone: 'neutral',
        label: 'Stopped',
      })
    default:
      return undefined
  }
}

function updateRow(
  base: Pick<InboxRow, 'id' | 'atMs' | 'destination'>,
  item: Theorem.ChatAttentionItem,
  conversation: string,
  action: string,
  glyph: Glyph,
  status: InboxRow['status'],
): InboxRow {
  return {
    ...base,
    section: 'updates',
    title: conversation,
    line: joined(action, nonEmpty(item.detail) ?? nonEmpty(item.summary)),
    status,
    glyph,
    seenThreadId: item.source.threadId,
    snoozeThreadId: item.source.threadId,
    hint: 'Opens the conversation and clears this update',
  }
}

/** The feed arrives with each section newest first; the order is kept. */
export function sectionsOf(feed: Theorem.ChatAttentionFeed): InboxSections {
  const rows = feed.items.flatMap((item) => rowOf(item) ?? [])
  return {
    needsYou: rows.filter((row) => row.section === 'needs_you'),
    updates: rows.filter((row) => row.section === 'updates'),
  }
}

const SHORT_UNIT = {
  xSeconds: 's',
  xMinutes: 'm',
  xHours: 'h',
  xDays: 'd',
  xMonths: 'mo',
  xYears: 'y',
} as const

/** "now", "5m", "3h", "2d": the compact age a row shows beside its title. */
export function shortAge(atMs: number, nowMs: number): string {
  if (nowMs - atMs < 45_000) return 'now'
  return formatDistanceStrict(atMs, nowMs, {
    roundingMethod: 'floor',
    locale: {
      // Strict distances only produce the x-unit tokens.
      formatDistance: (token: string, count: number) =>
        `${count}${SHORT_UNIT[token as keyof typeof SHORT_UNIT]}`,
    },
  })
}

export type Snooze = 'hour' | 'tomorrow'

/** The moment a snoozed update comes back: an hour from now, or 8:00 the next morning. */
export function snoozeUntil(choice: Snooze, now: Date): number {
  if (choice === 'hour') return now.getTime() + 60 * 60_000
  const morning = new Date(now)
  morning.setDate(morning.getDate() + 1)
  morning.setHours(8, 0, 0, 0)
  return morning.getTime()
}

export const snoozeLabel = (choice: Snooze) => (choice === 'hour' ? 'for an hour' : 'until tomorrow morning')
