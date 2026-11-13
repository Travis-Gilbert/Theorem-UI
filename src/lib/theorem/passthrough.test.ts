import { afterAll, beforeAll, expect, test } from 'bun:test'
import { installFakeTheorem } from '@/stories/fake-theorem'
import { theoremJson } from './passthrough'

// The SDK resolves routes against the page's origin, which a bare happy-dom
// page does not have.
const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
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

test('a non-JSON Connections refusal keeps its HTTP status', async () => {
  const restore = installFakeTheorem({
    'GET /api/connections/v1/mcp': () =>
      new Response('<h1>Not Found</h1>', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      }),
  })
  try {
    await expect(theoremJson('/api/connections/v1/mcp')).rejects.toMatchObject({
      statusCode: 404,
    })
  } finally {
    restore()
  }
})

test('a JSON refusal keeps the Theorem problem', async () => {
  const problem = {
    code: 'mcp_oauth_unconfigured',
    detail: 'OAuth is unavailable.',
  }
  const restore = installFakeTheorem({
    'POST /api/connections/v1/mcp/server/connect': () =>
      Response.json(problem, {
        status: 503,
        headers: { 'content-type': 'application/problem+json' },
      }),
  })
  try {
    await expect(
      theoremJson('/api/connections/v1/mcp/server/connect', { method: 'POST' }),
    ).rejects.toMatchObject({ statusCode: 503, body: problem })
  } finally {
    restore()
  }
})
