// SOURCING: none. Maps Theorem's attention feed (@theoremharness/sdk chat.attention, spec docs/plans/phone-inbox/SPEC-ATTENTION-FEED.md in Theorem) to rows. The server decides what is listed and when it leaves; nothing here is derived, inferred or kept.
import type { Theorem } from '@theoremharness/sdk'
import { routeOf } from '../chat/selection'
import type { Tone } from '@/ui/status'

export type InboxRow = {
  id: string
  section: 'needs_you' | 'updates'
  title: string
  detail?: string
  status: { tone: Tone; label: string }
  atMs: number
  /** Where the item lives: the conversation the run belongs to. */
  destination: ReturnType<typeof routeOf>
  /** Opening an update is the person looking at it, which is what makes it leave. */
  seenThreadId?: string
  hint: string
}

export type InboxSections = { needsYou: InboxRow[]; updates: InboxRow[] }

const EMPTY_TITLE = 'New conversation'

const nonEmpty = (value: string | undefined) => (value?.trim() ? value.trim() : undefined)

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
        detail: conversation,
        status: { tone: 'attention', label: 'Needs your decision' },
        hint: 'Opens the conversation, where you review the request and decide',
      }
    case 'review':
      return {
        ...base,
        section: 'needs_you',
        title: nonEmpty(item.detail) ?? 'Theo needs you to choose',
        detail: conversation,
        status: { tone: 'attention', label: 'Needs your answer' },
        hint: 'Opens the conversation, where you answer',
      }
    case 'completed':
      return updateRow(base, item, conversation, { tone: 'success', label: 'Finished' })
    case 'failed':
      return updateRow(base, item, conversation, { tone: 'error', label: 'Failed' })
    case 'interrupted':
      return updateRow(base, item, conversation, { tone: 'error', label: 'Interrupted' })
    case 'stopped':
      return updateRow(base, item, conversation, { tone: 'neutral', label: 'Stopped' })
    default:
      return undefined
  }
}

function updateRow(
  base: Pick<InboxRow, 'id' | 'atMs' | 'destination'>,
  item: Theorem.ChatAttentionItem,
  conversation: string,
  status: InboxRow['status'],
): InboxRow {
  return {
    ...base,
    section: 'updates',
    title: conversation,
    detail: nonEmpty(item.detail) ?? nonEmpty(item.summary),
    status,
    seenThreadId: item.source.threadId,
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

/** "5 min ago", "Yesterday", or the date once it is older than a week. */
export function ageOf(atMs: number, nowMs: number): string {
  const minutes = Math.floor((nowMs - atMs) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(atMs).toLocaleDateString(undefined, { dateStyle: 'medium' })
}
