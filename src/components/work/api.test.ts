// SOURCING: bun:test over the work tracker's items query, a read the contract sends as a POST: the server checks CSRF on every method but GET, so the request must carry the token and an idempotency key. Against a stand-in Theorem
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test'
import { queryItems } from './api'

const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => page.setURL('http://localhost:3000/'))
afterAll(() => page.setURL('about:blank'))

type Call = { method: string; path: string; headers: Headers; body?: string }
let calls: Call[]
const realFetch = window.fetch

beforeEach(() => {
  calls = []
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined)
    calls.push({ method, path: url.pathname, headers, body: typeof raw === 'string' ? raw : undefined })
    if (url.pathname === '/api/chat/v1/bootstrap')
      return Response.json({ schema: 'theorem.chat.bootstrap.v1', csrfToken: 'csrf' })
    if (url.pathname === '/api/work/v1/items/query')
      return Response.json({ items: [], total: 0 })
    return Response.json({}, { status: 404 })
  }) as typeof fetch
})
afterEach(() => {
  window.fetch = realFetch
})

test('the items query is a POST that carries the CSRF token and an idempotency key', async () => {
  const query = { groupBy: 'status', limit: 50 } as const
  const answer = await queryItems(query)

  expect(answer).toEqual({ items: [], total: 0 })
  const sent = calls.find((c) => c.path === '/api/work/v1/items/query')!
  expect(sent.method).toBe('POST')
  expect(sent.headers.get('X-CSRF-Token')).toBe('csrf')
  expect(sent.headers.get('Idempotency-Key')).toBeTruthy()
  expect(JSON.parse(sent.body!)).toEqual(query)
})
