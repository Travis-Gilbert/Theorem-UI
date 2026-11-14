// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import type { Theorem } from '@theoremharness/sdk'
import { matchThreads, mostRecentThread, threadDetails, threadState } from './thread-model'

const thread = (overrides: Partial<Theorem.Thread> = {}): Theorem.Thread =>
  ({
    schema: 'theorem-chat/1',
    threadId: 'thread-1',
    tenantId: 't',
    projectId: 'p',
    title: 'Mott proposal',
    status: 'regular',
    selectedBranchId: 'b',
    activeRunId: null,
    activeRunCursor: 0,
    revision: 1,
    createdAtMs: 1_000,
    updatedAtMs: 2_000,
    ...overrides,
  }) as Theorem.Thread

describe('threadState', () => {
  test('a run in progress is Working', () => {
    expect(threadState(thread({ activeRunId: 'run-1', lastMessageAtMs: 3_000 }))?.label).toBe('Working')
  })
  test('a pending turn waits to start', () => {
    const pendingTurn = { messageId: 'm', branchId: 'b', receiptId: 'r', createdAtMs: 1 }
    expect(threadState(thread({ pendingTurn, lastMessageAtMs: 3_000 }))?.label).toBe('Waiting to start')
  })
  test.each([
    ['completed', 'Finished', 'muted'],
    ['failed', 'Failed', 'error'],
    ['stopped', 'Stopped', 'muted'],
    ['ended', 'Ended', 'muted'],
  ] as const)('a run that %s reads %s', (outcome, label, tone) => {
    const state = threadState(thread({ lastMessageAtMs: 3_000, lastRun: { runId: 'r', outcome, endedAtMs: 4_000 } }))
    expect(state).toMatchObject({ label, tone })
  })
  test('a thread without messages says so', () => {
    expect(threadState(thread())?.label).toBe('No messages yet')
  })
  test('messages without a recorded run say nothing', () => {
    expect(threadState(thread({ lastMessageAtMs: 3_000 }))).toBeUndefined()
  })
})

describe('mostRecentThread', () => {
  test('picks the latest message, falling back to the last update', () => {
    const older = thread({ threadId: 'older', lastMessageAtMs: 5_000 })
    const newer = thread({ threadId: 'newer', updatedAtMs: 9_000 })
    expect(mostRecentThread([older, newer])?.threadId).toBe('newer')
  })
  test('skips archived and deleted threads', () => {
    const archived = thread({ threadId: 'archived', status: 'archived', updatedAtMs: 9_000 })
    const deleted = thread({ threadId: 'deleted', deletedAtMs: 1, updatedAtMs: 8_000 })
    const kept = thread({ threadId: 'kept', updatedAtMs: 1_000 })
    expect(mostRecentThread([archived, deleted, kept])?.threadId).toBe('kept')
  })
  test('is undefined for no threads', () => {
    expect(mostRecentThread([])).toBeUndefined()
  })
})

describe('threadDetails', () => {
  test('carries the identifier and the full times, not the row', () => {
    const text = threadDetails(thread({ lastMessageAtMs: 3_000 }), 'Chats')
    expect(text).toContain('Thread: thread-1')
    expect(text).toContain('Project: Chats')
    expect(text).toContain('Last message:')
  })
})

describe('matchThreads', () => {
  const threads = [
    thread({ threadId: 'a', title: 'Mott proposal' }),
    thread({ threadId: 'b', title: 'Lunch plans' }),
    thread({ threadId: 'c', title: '  ' }),
  ]
  test('matches the title ignoring case, in the given order', () => {
    expect(matchThreads(threads, 'PRO').map((entry) => entry.threadId)).toEqual(['a'])
  })
  test('an empty query matches nothing', () => {
    expect(matchThreads(threads, '  ')).toEqual([])
  })
  test('an untitled thread matches by the title it is shown with', () => {
    expect(matchThreads(threads, 'new conv').map((entry) => entry.threadId)).toEqual(['c'])
  })
})
