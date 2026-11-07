// SOURCING: canonical SDK history projection and first-user title behavior.
import { expect, test } from 'bun:test'
import type { ThreadMessageLike } from '@assistant-ui/react'
import type { Theorem } from './client'
import { isUntitledTitle, threadTitle } from './thread-title'

function snapshot(title = 'New Chat', text?: string) {
  return {
    thread: { title, threadId: 'title', revision: 1, status: 'regular' },
    messages:
      text === undefined
        ? []
        : [
            {
              messageId: 'user',
              role: 'user',
              parts: [{ partId: 'text', type: 'text', payload: { text } }],
            },
          ],
  } as unknown as Theorem.ThreadSnapshot
}

const user = (content: ThreadMessageLike['content']): ThreadMessageLike => ({
  role: 'user',
  content,
})

test.each([undefined, '', '  ', 'New Chat', ' NEW chat '])(
  'recognizes placeholder %j',
  (title) => {
    expect(isUntitledTitle(title)).toBe(true)
  },
)

test('preserves a custom title and prefers canonical first-user history', () => {
  expect(
    threadTitle(snapshot('My title', 'Old question'), [user('New question')]),
  ).toBe('My title')
  expect(
    threadTitle(snapshot('New Chat', 'Old question'), [user('New question')]),
  ).toBe('Old question')
})

test('uses local first-user text only when canonical user history is absent', () => {
  expect(
    threadTitle(snapshot(), [
      { role: 'assistant', content: 'Do not title this' },
      user('  Plan\n a  garden '),
      user('Later'),
    ]),
  ).toBe('Plan a garden')
  expect(
    threadTitle(snapshot(), [
      user([
        { type: 'text', text: 'Plan' },
        { type: 'image', image: 'https://example.com/image.png' },
        { type: 'text', text: 'a garden' },
      ]),
    ]),
  ).toBe('Plan a garden')
  expect(threadTitle(snapshot())).toBe('New chat')
  expect(threadTitle(snapshot(), [user('  ')])).toBe('New chat')
})

test('truncates long titles at a word boundary or at sixty characters for a long token', () => {
  const words =
    'Compare SQLite and PostgreSQL for an offline personal notes application with sync'
  expect(threadTitle(snapshot(), [user(words)])).toBe(
    'Compare SQLite and PostgreSQL for an offline personal notes...',
  )
  expect(threadTitle(snapshot(), [user('x'.repeat(70))])).toBe(
    `${'x'.repeat(60)}...`,
  )
})
