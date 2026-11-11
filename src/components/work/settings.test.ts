// SOURCING: bun:test over the work tracker's settings writes (read, change the two switches, write the whole object back with If-Match), against a stand-in Theorem
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { bootstrap } from '@/lib/theorem/client'
import { SETTINGS } from './fixtures'
import type { WorkSettings } from './contract'
import { saveSettings, withChange } from './settings'

const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => page.setURL('http://localhost:3000/'))
afterAll(() => page.setURL('about:blank'))

type Call = { method: string; path: string; headers: Headers; body?: string }
let calls: Call[]
/** What the server holds; a write bumps its revision. */
let stored: WorkSettings
/** Writes to refuse as out of date before one is accepted. */
let stale: number
const realFetch = window.fetch

beforeEach(async () => {
  calls = []
  stale = 0
  stored = {
    ...SETTINGS,
    consequences: [
      { id: 'push_refreshes_context', enabled: true },
      { id: 'issue_comment_joins_task', enabled: false },
    ],
  }
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined)
    const body =
      typeof raw === 'string' || raw === undefined
        ? raw
        : new TextDecoder().decode(raw as BufferSource)
    calls.push({ method, path: url.pathname, headers, body })
    if (url.pathname === '/api/chat/v1/bootstrap')
      return Response.json({ schema: 'theorem.chat.bootstrap.v1', csrfToken: 'csrf' })
    if (url.pathname === '/api/work/v1/settings' && method === 'GET')
      return Response.json(stored)
    if (url.pathname === '/api/work/v1/settings' && method === 'PUT') {
      if (stale > 0) {
        stale--
        // Someone else wrote first.
        stored = { ...stored, revision: `${stored.revision}+` }
        return Response.json({ title: 'Precondition failed' }, { status: 412 })
      }
      if (headers.get('If-Match') !== stored.revision)
        return Response.json({ title: 'Precondition failed' }, { status: 412 })
      stored = { ...(JSON.parse(body ?? '{}') as WorkSettings), revision: `${stored.revision}.` }
      return Response.json(stored)
    }
    return Response.json({}, { status: 404 })
  }) as typeof fetch
  // The session is cached for the whole app, so another test file may have left one behind.
  await bootstrap(true)
  calls = []
})
afterEach(() => {
  window.fetch = realFetch
})

const puts = () => calls.filter((c) => c.method === 'PUT')

describe('withChange', () => {
  test('moves only the two switches', () => {
    const next = withChange(SETTINGS, { enabled: false })
    expect(next.enabled).toBe(false)
    expect(next.github).toEqual(SETTINGS.github)
    const github = withChange(SETTINGS, { github: false })
    expect(github.enabled).toBe(true)
    expect(github.github).toEqual({ enabled: false, repos: SETTINGS.github.repos })
    expect(withChange(SETTINGS, {})).toEqual(SETTINGS)
  })
})

describe('saving the switches', () => {
  test('reads fresh, writes the whole object back with the revision it read, and keeps the consequences', async () => {
    const saved = await saveSettings({ github: false })

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/work/v1/settings',
      'PUT /api/work/v1/settings',
    ])
    const put = puts()[0]!
    expect(put.headers.get('If-Match')).toBe('s1')
    expect(put.headers.get('X-CSRF-Token')).toBe('csrf')
    const sent = JSON.parse(put.body!) as WorkSettings
    expect(sent.github.enabled).toBe(false)
    expect(sent.consequences).toEqual(stored.consequences)
    expect(sent.consequences).toHaveLength(2)
    expect(saved.github.enabled).toBe(false)
  })

  test('a write that lost the race is read and made again once, on top of the newer settings', async () => {
    stale = 1
    // Another screen changed the consequences meanwhile; they must survive.
    const saved = await saveSettings({ enabled: false })
    expect(puts()).toHaveLength(2)
    expect(puts()[1]!.headers.get('If-Match')).toBe('s1+')
    expect(saved.enabled).toBe(false)
    expect(saved.consequences).toHaveLength(2)
  })

  test('a second loss is reported rather than retried forever', async () => {
    stale = 2
    await expect(saveSettings({ enabled: false })).rejects.toMatchObject({ statusCode: 412 })
    expect(puts()).toHaveLength(2)
  })
})
