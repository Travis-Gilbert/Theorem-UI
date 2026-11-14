// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import type { Theorem } from '@theoremharness/sdk'
import { rowOf, sectionsOf, shortAge, snoozeUntil } from './model'

const item = (over: Partial<Theorem.ChatAttentionItem> & Pick<Theorem.ChatAttentionItem, 'kind'>) =>
  ({
    id: `item:${over.kind}`,
    section: over.kind === 'approval' || over.kind === 'review' ? 'needs_you' : 'updates',
    state: over.kind === 'approval' || over.kind === 'review' ? 'awaiting' : 'unseen',
    title: 'Compare the two drafts',
    atMs: 1_000,
    source: { kind: 'thread', threadId: 'thread-1', projectId: 'project-1' },
    resolution: { via: 'seen', threadId: 'thread-1' },
    ...over,
  }) as Theorem.ChatAttentionItem

const feed = (items: Theorem.ChatAttentionItem[], updatesTruncated = false) =>
  ({ schema: 'theorem-attention/1', items, updatesTruncated }) as Theorem.ChatAttentionFeed

describe('inbox rows', () => {
  test('an approval asks for a decision and opens its conversation', () => {
    const row = rowOf(
      item({
        kind: 'approval',
        detail: 'Allow write_file to run?',
        source: {
          kind: 'thread',
          threadId: 'thread-1',
          projectId: 'project-1',
          runId: 'run-1',
          approvalId: 'a-1',
        },
        resolution: { via: 'approval', runId: 'run-1', approvalId: 'a-1' },
      }),
    )!
    expect(row.section).toBe('needs_you')
    expect(row.title).toBe('Allow write_file to run?')
    expect(row.line).toBe('Theo asked for your approval · Compare the two drafts')
    expect(row.glyph).toBe('hand.raised.fill')
    expect(row.status).toEqual({ tone: 'attention', label: 'Needs your decision' })
    expect(row.destination).toEqual({ pathname: '/chat/[threadId]', params: { threadId: 'thread-1' } })
    // A decision is made on the approval card in the conversation, never from the list.
    expect(row.seenThreadId).toBeUndefined()
  })

  test('a review shows its question', () => {
    const row = rowOf(item({ kind: 'review', detail: 'Choose which version to keep' }))!
    expect(row.section).toBe('needs_you')
    expect(row.title).toBe('Choose which version to keep')
    expect(row.status.label).toBe('Needs your answer')
    expect(row.line).toBe('Theo asked a question · Compare the two drafts')
    // Theorem's Later never holds back a question, so there is nothing to snooze.
    expect(row.snoozeThreadId).toBeUndefined()
  })

  test('an update names how the run ended and clears when its conversation is opened', () => {
    const cases = [
      ['completed', 'success', 'Finished'],
      ['failed', 'error', 'Failed'],
      ['interrupted', 'error', 'Interrupted'],
      ['stopped', 'neutral', 'Stopped'],
    ] as const
    for (const [kind, tone, label] of cases) {
      const row = rowOf(item({ kind }))!
      expect(row.section).toBe('updates')
      expect(row.status).toEqual({ tone, label })
      expect(row.title).toBe('Compare the two drafts')
      expect(row.seenThreadId).toBe('thread-1')
      expect(row.snoozeThreadId).toBe('thread-1')
    }
  })

  test('an update line carries the server reason, else the thread summary, never a sentence of its own', () => {
    expect(rowOf(item({ kind: 'interrupted', detail: 'The run was interrupted.', summary: 's' }))!.line).toBe(
      'Theo was interrupted · The run was interrupted.',
    )
    expect(rowOf(item({ kind: 'completed', summary: 'The comparison is ready' }))!.line).toBe(
      'Theo finished · The comparison is ready',
    )
    expect(rowOf(item({ kind: 'completed' }))!.line).toBe('Theo finished')
  })

  test('an empty thread title reads as a new conversation', () => {
    expect(rowOf(item({ kind: 'completed', title: '  ' }))!.title).toBe('New conversation')
  })

  test('an item of a kind or source this app does not know is dropped, not guessed', () => {
    expect(rowOf(item({ kind: 'sign_in' as never }))).toBeUndefined()
    expect(
      rowOf(item({ kind: 'completed', source: { kind: 'computer', computerId: 'c' } as never })),
    ).toBeUndefined()
  })
})

describe('inbox sections', () => {
  test('splits the feed into its two sections and keeps the server order', () => {
    const sections = sectionsOf(
      feed([
        item({ kind: 'approval', id: 'a' }),
        item({ kind: 'review', id: 'b' }),
        item({ kind: 'completed', id: 'c' }),
        item({ kind: 'failed', id: 'd' }),
      ]),
    )
    expect(sections.needsYou.map((row) => row.id)).toEqual(['a', 'b'])
    expect(sections.updates.map((row) => row.id)).toEqual(['c', 'd'])
  })

  test('an empty feed is empty sections', () => {
    expect(sectionsOf(feed([]))).toEqual({ needsYou: [], updates: [] })
  })
})

describe('shortAge', () => {
  const now = Date.UTC(2026, 10, 12, 12, 0, 0)
  test('reads now, minutes, hours and days in one short token', () => {
    expect(shortAge(now - 20_000, now)).toBe('now')
    expect(shortAge(now - 5 * 60_000, now)).toBe('5m')
    expect(shortAge(now - 3 * 3_600_000, now)).toBe('3h')
    expect(shortAge(now - 30 * 3_600_000, now)).toBe('1d')
    expect(shortAge(now - 4 * 86_400_000, now)).toBe('4d')
  })
})

describe('snoozeUntil', () => {
  const afternoon = new Date(2026, 10, 14, 15, 30)
  test('an hour is an hour from now', () => {
    expect(snoozeUntil('hour', afternoon)).toBe(afternoon.getTime() + 3_600_000)
  })
  test('tomorrow is 8:00 the next morning, even from late at night or after midnight', () => {
    for (const now of [afternoon, new Date(2026, 10, 14, 23, 59), new Date(2026, 10, 15, 0, 5)]) {
      const at = new Date(snoozeUntil('tomorrow', now))
      expect([at.getHours(), at.getMinutes()]).toEqual([8, 0])
      expect(at.getDate()).toBe(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getDate())
    }
  })
})
