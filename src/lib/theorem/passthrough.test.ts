import { afterAll, beforeAll, expect, test } from 'bun:test'
import { installFakeTheorem } from '@/stories/fake-theorem'
import { theoremJson } from './passthrough'

// The SDK resolves routes against the page's origin, which a bare happy-dom
// page does not have.
const page = (window as unknown as { happyDOM: { setURL: (url: string) => void } })
  .happyDOM
beforeAll(() => page.setURL('http://localhost:3000/'))
afterAll(() => page.setURL('about:blank'))

test('a route with a query reaches Theorem with its query, not folded into the path', async () => {
  const restore = installFakeTheorem({
    'GET /api/chat/v1/librarian/history': (_params, request) => ({
      search: new URL(request.url).search,
    }),
  })
  try {
    expect(
      await theoremJson<{ search: string }>(
        '/api/chat/v1/librarian/history?limit=50&threadId=t1',
      ),
    ).toEqual({ search: '?limit=50&threadId=t1' })
  } finally {
    restore()
  }
})
