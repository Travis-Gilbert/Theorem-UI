// The library record reaches Theorem the way the Index's does: read what is
// published, compare digests, and PUT this build's record only when it differs.
// fetch is stubbed; no Theorem runs here.
import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test'
import { libraryRecord } from './library'
import { LIBRARY_PATH, syncLibraryRecord } from './publication'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

type Call = { method: string; path: string; headers: Headers; body?: string }

function stubTheorem(published: () => Response) {
  const calls: Call[] = []
  const spy = spyOn(globalThis, 'fetch').mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request ? input : undefined
    const path = new URL(String(request?.url ?? input), window.location.origin)
      .pathname
    const method = init?.method ?? request?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? init.body : undefined
    calls.push({ method, path, headers: new Headers(init?.headers), body })
    if (path === '/api/chat/v1/bootstrap')
      return json({ schema: 'theorem.chat.bootstrap.v1', csrfToken: 'csrf' })
    if (path === LIBRARY_PATH && method === 'GET') return published()
    if (path === LIBRARY_PATH && method === 'PUT') return json(JSON.parse(body ?? '{}'))
    return json({}, 404)
  }) as typeof fetch)
  return { calls, restore: () => spy.mockRestore() }
}

const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => page.setURL('http://localhost:3000/'))
afterAll(() => page.setURL('about:blank'))

let restore = () => {}
afterEach(() => restore())

describe('library record publication', () => {
  test('publishes the record when Theorem has none yet', async () => {
    const theorem = stubTheorem(() => json({ code: 'not_found' }, 404))
    restore = theorem.restore
    const record = await libraryRecord()

    const held = await syncLibraryRecord()

    const put = theorem.calls.find((c) => c.method === 'PUT')
    expect(put?.path).toBe('/api/artifacts/v1/libraries/theorem-artifacts')
    expect(put?.headers.get('X-CSRF-Token')).toBe('csrf')
    expect(put?.headers.get('Idempotency-Key')).toBeTruthy()
    expect(JSON.parse(put?.body ?? '{}')).toEqual(record)
    expect(held.digest).toBe(record.digest)
  })

  test('publishes again when the digest Theorem holds is stale', async () => {
    const theorem = stubTheorem(() =>
      json({ libraryId: 'theorem-artifacts', version: '1', digest: 'old' }),
    )
    restore = theorem.restore

    await syncLibraryRecord()

    expect(theorem.calls.some((c) => c.method === 'PUT')).toBe(true)
  })

  test('leaves a matching record alone', async () => {
    const record = await libraryRecord()
    const theorem = stubTheorem(() => json(record))
    restore = theorem.restore

    const held = await syncLibraryRecord()

    expect(theorem.calls.some((c) => c.method === 'PUT')).toBe(false)
    expect(held.digest).toBe(record.digest)
  })
})
