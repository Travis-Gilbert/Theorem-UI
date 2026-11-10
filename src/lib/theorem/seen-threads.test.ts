import { describe, expect, test } from 'bun:test'
import { firstUnseen } from './seen-threads'

const message = (id: string, role: string, atMs: number) => ({
  id,
  role,
  createdAt: new Date(atMs),
})

const thread = [
  message('ask', 'user', 100),
  message('answer', 'assistant', 200),
  message('follow-up', 'user', 300),
  message('away-1', 'assistant', 400),
  message('away-2', 'assistant', 500),
  message('live', 'assistant', 700),
]

describe('firstUnseen', () => {
  test('marks the first reply that landed while the thread was off screen', () => {
    expect(firstUnseen(thread, { since: 350, openedAt: 600 })).toBe('away-1')
  })

  test('leaves out replies that arrive while the thread is open', () => {
    expect(firstUnseen(thread, { since: 550, openedAt: 600 })).toBeUndefined()
  })

  test('does not mark messages the person sent', () => {
    expect(firstUnseen(thread, { since: 250, openedAt: 350 })).toBeUndefined()
  })

  test('marks nothing in a thread never seen in this browser', () => {
    expect(
      firstUnseen(thread, { since: undefined, openedAt: 600 }),
    ).toBeUndefined()
  })
})
