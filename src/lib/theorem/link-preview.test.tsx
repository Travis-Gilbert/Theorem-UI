import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test'
import {
  defaultScheduler,
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act } from 'react'
import { cleanup, render, waitFor } from '../../../test/blocks/render'
import { linkMetadataQueryKey, useLinkMetadata } from './link-preview'

const originalFetch = window.fetch
const url = 'https://example.com/recovering-source'
const clients = new Set<QueryClient>()

afterEach(async () => {
  try {
    await cleanup()
  } finally {
    for (const client of clients) client.clear()
    clients.clear()
    notifyManager.setScheduler(defaultScheduler)
    window.fetch = originalFetch
    if (jest.isFakeTimers()) {
      jest.clearAllTimers()
      jest.useRealTimers()
    }
  }
})

function Metadata() {
  const query = useLinkMetadata(url)
  return <p>{query.data?.title ?? 'No preview'}</p>
}

function recoveredSource() {
  let requests = 0
  window.fetch = Object.assign(
    async () => {
      requests += 1
      return Response.json({ href: url, title: 'Recovered source' })
    },
    { preconnect: originalFetch.preconnect },
  )
  return () => requests
}

function newClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  })
  clients.add(client)
  return client
}

function clientWith(data: { href: string; title: string } | null, age: number) {
  const client = newClient()
  client.setQueryData(linkMetadataQueryKey(url), data, {
    updatedAt: Date.now() - age,
  })
  return client
}

test('a missing preview can recover after the five-minute negative cache expires', async () => {
  const requests = recoveredSource()
  const client = clientWith(null, 5 * 60_000 + 1000)
  const { container } = await render(
    <QueryClientProvider client={client}>
      <Metadata />
    </QueryClientProvider>,
  )
  await waitFor(() => container.textContent.includes('Recovered source'))
  expect(requests()).toBe(1)
  expect(client.getQueryData(linkMetadataQueryKey(url))).toMatchObject({
    title: 'Recovered source',
  })
})

test('a missing preview remains cached inside the server negative-cache window', async () => {
  const requests = recoveredSource()
  const client = clientWith(null, 4 * 60_000)
  const { container } = await render(
    <QueryClientProvider client={client}>
      <Metadata />
    </QueryClientProvider>,
  )
  expect(container.textContent).toBe('No preview')
  expect(requests()).toBe(0)
})

test('a successful preview keeps its longer freshness window', async () => {
  const requests = recoveredSource()
  const client = clientWith({ href: url, title: 'Cached source' }, 6 * 60_000)
  const { container } = await render(
    <QueryClientProvider client={client}>
      <Metadata />
    </QueryClientProvider>,
  )
  expect(container.textContent).toBe('Cached source')
  expect(requests()).toBe(0)
})

function scriptedFetch(
  respond: (attempt: number) => Response | Promise<Response>,
) {
  const attempts: number[] = []
  const start = Date.now()
  window.fetch = Object.assign(
    async () => {
      attempts.push(Date.now() - start)
      return respond(attempts.length)
    },
    { preconnect: originalFetch.preconnect },
  )
  return attempts
}

function overload(hint: string | null = null) {
  return new Response(null, {
    status: 503,
    headers: hint === null ? {} : { 'retry-after': hint },
  })
}

function success() {
  return Response.json({ href: url, title: 'Recovered source' })
}

// Advance retry timers, then flush fetch/JSON continuations and React notifications.
async function advance(milliseconds = 0) {
  await act(async () => {
    if (milliseconds > 0) jest.advanceTimersByTime(milliseconds)
    for (let turn = 0; turn < 16; turn++) await Promise.resolve()
  })
}

async function mountedMetadata() {
  const client = newClient()
  const { container } = await render(
    <QueryClientProvider client={client}>
      <Metadata />
    </QueryClientProvider>,
  )
  await advance()
  return { client, container }
}

describe('temporary preview overload recovery', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-21T12:00:00Z') })
    // Keep subscriber updates in act without advancing Bun's zero-delay clock.
    notifyManager.setScheduler(queueMicrotask)
  })

  test('recovers on the mounted consumer after capacity can clear, without refocus or remount', async () => {
    const attempts = scriptedFetch((attempt) =>
      attempt < 4 ? overload('1') : success(),
    )
    const { client, container } = await mountedMetadata()
    expect(container.textContent).toBe('No preview')
    for (const delay of [1_000, 2_000, 4_000]) {
      const count = attempts.length
      await advance(delay - 1)
      expect(attempts).toHaveLength(count)
      await advance(1)
      expect(attempts).toHaveLength(count + 1)
    }
    expect(attempts).toEqual([0, 1_000, 3_000, 7_000])
    expect(container.textContent).toBe('Recovered source')
    expect(client.getQueryData(linkMetadataQueryKey(url))).toMatchObject({
      title: 'Recovered source',
    })
    await advance(30_000)
    expect(attempts).toHaveLength(4)
  })

  test('stops after three retries and retains the fallback without caching a missing preview', async () => {
    const attempts = scriptedFetch(() => overload())
    const { client, container } = await mountedMetadata()
    for (const delay of [1_000, 2_000, 4_000]) await advance(delay)
    expect(attempts).toEqual([0, 1_000, 3_000, 7_000])
    expect(container.textContent).toBe('No preview')
    expect(client.getQueryData(linkMetadataQueryKey(url))).toBeUndefined()
    expect(client.getQueryState(linkMetadataQueryKey(url))).toMatchObject({
      status: 'error',
      fetchStatus: 'idle',
    })
    await advance(30_000)
    expect(attempts).toHaveLength(4)
  })

  for (const [format, now, hint] of [
    ['seconds', '2026-11-21T12:00:00Z', '5'],
    ['IMF-fixdate', '2026-11-21T12:00:00Z', 'Sat, 21 Nov 2026 12:00:05 GMT'],
    ['RFC850', '2026-11-21T12:00:00Z', 'Saturday, 21-Nov-26 12:00:05 GMT'],
    ['asctime in UTC', '2026-11-21T12:00:00Z', 'Sat Nov 21 12:00:05 2026'],
    ['asctime padded day', '2026-11-07T12:00:00Z', 'Sat Nov  7 12:00:05 2026'],
    [
      'RFC850 past the JS pivot',
      '2049-12-31T23:59:55Z',
      'Saturday, 01-Jan-50 00:00:00 GMT',
    ],
    [
      'RFC850 across centuries',
      '2099-12-31T23:59:55Z',
      'Friday, 01-Jan-00 00:00:00 GMT',
    ],
    [
      'HTTP leap second',
      '2016-12-31T23:59:55Z',
      'Sat, 31 Dec 2016 23:59:60 GMT',
    ],
  ] as const) {
    test(`respects a reasonable Retry-After ${format} hint`, async () => {
      jest.setSystemTime(new Date(now))
      const attempts = scriptedFetch((attempt) =>
        attempt === 1 ? overload(hint) : success(),
      )
      const { container } = await mountedMetadata()
      await advance(4_999)
      expect(attempts).toEqual([0])
      await advance(1)
      expect(attempts).toEqual([0, 5_000])
      expect(container.textContent).toBe('Recovered source')
    })
  }

  test('bounds cumulative scheduled retry delay to thirty seconds', async () => {
    const attempts = scriptedFetch(() => overload('10'))
    const { client } = await mountedMetadata()
    for (let retry = 0; retry < 3; retry++) {
      await advance(9_999)
      expect(attempts).toHaveLength(retry + 1)
      await advance(1)
      expect(attempts).toHaveLength(retry + 2)
    }
    expect(attempts).toEqual([0, 10_000, 20_000, 30_000])
    await advance(60_000)
    expect(attempts).toHaveLength(4)
    expect(client.getQueryState(linkMetadataQueryKey(url))?.status).toBe(
      'error',
    )
  })

  for (const hint of [null, '', 'not-a-delay', '-1', '1.5', '0', 'Infinity']) {
    test(`uses paced retries for missing, invalid, or immediate hint ${String(hint)}`, async () => {
      const attempts = scriptedFetch((attempt) =>
        attempt === 1 ? overload(hint) : success(),
      )
      const { container } = await mountedMetadata()
      await advance(999)
      expect(attempts).toEqual([0])
      await advance(1)
      expect(attempts).toEqual([0, 1_000])
      expect(container.textContent).toBe('Recovered source')
    })
  }

  test('a non-HTTP Date.toString hint cannot suppress mounted recovery', async () => {
    const hint = new Date(Date.now() + 11_000).toString()
    const attempts = scriptedFetch((attempt) =>
      attempt === 1 ? overload(hint) : success(),
    )
    const { container } = await mountedMetadata()
    await advance(999)
    expect(attempts).toEqual([0])
    await advance(1)
    expect(attempts).toEqual([0, 1_000])
    expect(container.textContent).toBe('Recovered source')
  })

  test('non-HTTP surrounding whitespace cannot suppress mounted recovery', async () => {
    const hint = `\u00a0${new Date(Date.now() + 11_000).toUTCString()}\u00a0`
    const attempts = scriptedFetch((attempt) =>
      attempt === 1 ? overload(hint) : success(),
    )
    const { container } = await mountedMetadata()
    await advance(999)
    expect(attempts).toEqual([0])
    await advance(1)
    expect(attempts).toEqual([0, 1_000])
    expect(container.textContent).toBe('Recovered source')
  })

  for (const [invalid, hint] of [
    ['overflowing day', 'Tue, 31 Nov 2026 12:00:11 GMT'],
    ['non-leap February', 'Monday, 29-Feb-27 12:00:11 GMT'],
    ['wrong weekday', 'Sun, 21 Nov 2026 12:00:11 GMT'],
    ['overflowing hour', 'Sat Nov 21 24:00:00 2026'],
    ['overflowing minute', 'Sat, 21 Nov 2026 12:60:11 GMT'],
    ['overflowing second', 'Sat, 21 Nov 2026 12:00:61 GMT'],
    ['wrong capitalization', 'sat, 21 Nov 2026 12:00:11 GMT'],
    ['non-HTTP timezone', 'Sat, 21 Nov 2026 12:00:11 UTC'],
    ['extra internal space', 'Sat, 21  Nov 2026 12:00:11 GMT'],
  ] as const) {
    test(`a date with ${invalid} uses the paced fallback`, async () => {
      const attempts = scriptedFetch((attempt) =>
        attempt === 1 ? overload(hint) : success(),
      )
      const { container } = await mountedMetadata()
      await advance(999)
      expect(attempts).toEqual([0])
      await advance(1)
      expect(attempts).toEqual([0, 1_000])
      expect(container.textContent).toBe('Recovered source')
    })
  }

  test('an RFC850 date exactly fifty years ahead remains future and exceeds the budget', async () => {
    const attempts = scriptedFetch(() =>
      overload('Saturday, 21-Nov-76 12:00:00 GMT'),
    )
    const { client } = await mountedMetadata()
    await advance(60_000)
    expect(attempts).toEqual([0])
    expect(client.getQueryState(linkMetadataQueryKey(url))?.status).toBe(
      'error',
    )
  })

  test('an RFC850 date more than fifty years ahead resolves to the past and observes the floor', async () => {
    const attempts = scriptedFetch((attempt) =>
      attempt === 1 ? overload('Sunday, 21-Nov-76 12:00:01 GMT') : success(),
    )
    const { container } = await mountedMetadata()
    await advance(999)
    expect(attempts).toEqual([0])
    await advance(1)
    expect(attempts).toEqual([0, 1_000])
    expect(container.textContent).toBe('Recovered source')
  })

  test('an expired date hint still observes the retry floor', async () => {
    const hint = new Date(Date.now() - 60_000).toUTCString()
    const attempts = scriptedFetch((attempt) =>
      attempt === 1 ? overload(hint) : success(),
    )
    await mountedMetadata()
    await advance(999)
    expect(attempts).toEqual([0])
    await advance(1)
    expect(attempts).toEqual([0, 1_000])
  })

  for (const format of ['seconds', 'date', 'overflowing seconds']) {
    test(`declines a ${format} hint beyond the delay budget`, async () => {
      const hint =
        format === 'date'
          ? new Date(Date.now() + 11_000).toUTCString()
          : format === 'seconds'
            ? '11'
            : '9'.repeat(400)
      const attempts = scriptedFetch(() => overload(hint))
      const { client } = await mountedMetadata()
      await advance(60_000)
      expect(attempts).toEqual([0])
      expect(client.getQueryData(linkMetadataQueryKey(url))).toBeUndefined()
      expect(client.getQueryState(linkMetadataQueryKey(url))?.status).toBe(
        'error',
      )
    })
  }

  for (const status of [400, 404, 429, 500, 502]) {
    test(`does not retry HTTP ${status}`, async () => {
      const attempts = scriptedFetch(
        () => new Response(null, { status, headers: { 'retry-after': '1' } }),
      )
      const { client } = await mountedMetadata()
      await advance(30_000)
      expect(attempts).toEqual([0])
      expect(client.getQueryData(linkMetadataQueryKey(url))).toBe(
        status === 400 || status === 404 ? null : undefined,
      )
    })
  }

  test('does not retry a network failure', async () => {
    const attempts = scriptedFetch(() => {
      throw new TypeError('Network unavailable')
    })
    const { client } = await mountedMetadata()
    await advance(30_000)
    expect(attempts).toEqual([0])
    expect(client.getQueryData(linkMetadataQueryKey(url))).toBeUndefined()
  })
})
