// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import type { Theorem } from '@theoremharness/sdk'
import { ageOf, rowOf, sectionsOf } from './model'

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
        source: { kind: 'thread', threadId: 'thread-1', projectId: 'project-1', runId: 'run-1', approvalId: 'a-1' },
        resolution: { via: 'approval', runId: 'run-1', approvalId: 'a-1' },
      }),
    )!
    expect(row.section).toBe('needs_you')
    expect(row.title).toBe('Allow write_file to run?')
    expect(row.detail).toBe('Compare the two drafts')
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
    }
  })

  test('an update carries the server reason, else the thread summary, never a sentence of its own', () => {
    expect(rowOf(item({ kind: 'interrupted', detail: 'The run was interrupted.', summary: 's' }))!.detail).toBe(
      'The run was interrupted.',
    )
    expect(rowOf(item({ kind: 'completed', summary: 'The comparison is ready' }))!.detail).toBe(
      'The comparison is ready',
    )
    expect(rowOf(item({ kind: 'completed' }))!.detail).toBeUndefined()
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

describe('ageOf', () => {
  const now = Date.UTC(2026, 10, 12, 12, 0, 0)
  test('reads minutes, hours and days', () => {
    expect(ageOf(now - 20_000, now)).toBe('Just now')
    expect(ageOf(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(ageOf(now - 3 * 3_600_000, now)).toBe('3 h ago')
    expect(ageOf(now - 30 * 3_600_000, now)).toBe('Yesterday')
    expect(ageOf(now - 4 * 86_400_000, now)).toBe('4 days ago')
  })
})
