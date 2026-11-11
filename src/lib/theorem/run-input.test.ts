import { afterAll, afterEach, beforeAll, expect, spyOn, test } from 'bun:test'
import { TheoremError } from '@theoremharness/sdk'
import { bootstrap } from './client'
import {
  createRunInputSender,
  dispatchRunInput,
  findRunInputReceipt,
} from './run-input'
import type { RunInputEnvelope } from './run-input'

const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => {
  page.setURL('http://localhost:3000/')
})
afterAll(() => {
  page.setURL('about:blank')
})

function storage() {
  const saved = new Map<string, string>()
  return {
    saved,
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value)
    },
    removeItem: (key: string) => {
      saved.delete(key)
    },
  }
}

const receipt = (envelope: RunInputEnvelope, status = 'queued') => ({
  runId: envelope.runId,
  idempotencyKey: `chat-command:${envelope.key}`,
  payload: {
    part: {
      type: 'user_input',
      inputId: `input-${envelope.key}`,
      text: envelope.text,
      status,
    },
  },
})

test('the exact input is saved before dispatch and only a receipt admits another send', async () => {
  const store = storage()
  const requests: RunInputEnvelope[] = []
  const sender = createRunInputSender(store, async (envelope) => {
    expect(JSON.parse([...store.saved.values()][0]!)).toEqual(envelope)
    requests.push(envelope)
    return receipt(envelope)
  })
  const text = '## Direction\n\nKeep `a * b` and Unicode: 日本語.\n'
  expect((await sender.send('thread', 'run', text))?.kind).toBe('accepted')
  expect(store.saved.size).toBe(0)
  expect(requests[0]!.text).toBe(text)
  expect(sender.getState('thread')?.message).toContain('Delivery is tracked')
  await sender.send('thread', 'run', 'One more thing')
  expect(requests[1]!.key).not.toBe(requests[0]!.key)
})

test('a pending input blocks duplicate clicks, retries, and a different draft', async () => {
  const store = storage()
  let finish!: (value: unknown) => void
  const requests: RunInputEnvelope[] = []
  const sender = createRunInputSender(store, (envelope) => {
    requests.push(envelope)
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const first = sender.send('thread', 'run', 'First')
  expect(sender.send('thread', 'run', 'First')).toBeUndefined()
  expect(sender.send('thread', 'new-run', 'Different')).toBeUndefined()
  expect(sender.retry('thread')).toBeUndefined()
  expect(sender.reset('thread')).toBe(false)
  expect(requests).toHaveLength(1)
  finish(receipt(requests[0]!))
  await first
})

test('ambiguous delivery survives reload and retries the original run, text, and key', async () => {
  const store = storage()
  let original!: RunInputEnvelope
  const beforeReload = createRunInputSender(store, async (envelope) => {
    original = envelope
    throw new Error('The response was lost after acceptance')
  })
  expect(
    (await beforeReload.send('thread-a', 'old-run', 'Original'))?.kind,
  ).toBe('unresolved')
  expect(beforeReload.send('thread-a', 'new-run', 'Different')).toBeUndefined()

  const retries: RunInputEnvelope[] = []
  const afterReload = createRunInputSender(store, async (envelope) => {
    retries.push(envelope)
    return receipt(envelope, 'delivered')
  })
  expect(afterReload.getState('thread-a')?.kind).toBe('unresolved')
  expect(afterReload.getState('thread-b')).toBeUndefined()
  expect(afterReload.send('thread-a', 'new-run', 'Different')).toBeUndefined()
  expect((await afterReload.retry('thread-a'))?.kind).toBe('accepted')
  expect(retries).toEqual([original])
  expect(store.saved.size).toBe(0)
})

test('a definite closed-run refusal settles the request without starting another turn', async () => {
  const store = storage()
  let calls = 0
  const sender = createRunInputSender(store, async () => {
    calls++
    throw new TheoremError({
      statusCode: 409,
      body: { code: 'run_input_closed' },
    })
  })
  const result = await sender.send('thread', 'run', 'Keep my draft')
  expect(result?.kind).toBe('closed')
  expect(result?.kind === 'closed' && result.envelope.text).toBe(
    'Keep my draft',
  )
  expect(store.saved.size).toBe(0)
  expect(sender.retry('thread')).toBeUndefined()
  expect(calls).toBe(1)
})

test('a malformed or unrelated success stays uncertain instead of clearing the journal', async () => {
  const store = storage()
  const sender = createRunInputSender(store, async (envelope) =>
    receipt({ ...envelope, text: 'A different message' }),
  )
  expect((await sender.send('thread', 'run', 'Mine'))?.kind).toBe('unresolved')
  expect(store.saved.size).toBe(1)
})

test('an empty input id cannot acknowledge a send', async () => {
  const store = storage()
  const sender = createRunInputSender(store, async (envelope) => {
    const answer = receipt(envelope)
    answer.payload.part.inputId = ''
    return answer
  })
  expect((await sender.send('thread', 'run', 'Mine'))?.kind).toBe('unresolved')
  expect(store.saved.size).toBe(1)
})

test('a not-delivered receipt retains the text for an explicit next turn', async () => {
  const sender = createRunInputSender(storage(), async (envelope) =>
    receipt(envelope, 'not_delivered'),
  )
  const result = await sender.send('thread', 'run', 'Mine')
  expect(result?.kind).toBe('closed')
  expect(result?.message).toContain('draft is still here')
})

test('storage failure blocks HTTP rather than creating an unrecoverable send', async () => {
  let calls = 0
  const store = storage()
  const sender = createRunInputSender(
    {
      ...store,
      setItem: () => {
        throw new Error('Quota exceeded')
      },
    },
    async () => {
      calls++
      return {}
    },
  )
  expect((await sender.send('thread', 'run', 'Mine'))?.kind).toBe('unavailable')
  expect(calls).toBe(0)
  expect(sender.send('thread', 'run', 'Different')).toBeUndefined()
})

test('a corrupt saved request cannot be overwritten by a fresh message', () => {
  const store = storage()
  store.setItem('theorem.pending-run-input:thread', '{bad json')
  const sender = createRunInputSender(store, async () => ({}))
  expect(sender.getState('thread')?.kind).toBe('unavailable')
  expect(sender.send('thread', 'run', 'Different')).toBeUndefined()
  expect(store.getItem('theorem.pending-run-input:thread')).toBe('{bad json')
  expect(sender.reset('thread')).toBe(true)
  expect(sender.getState('thread')?.kind).toBe('released')
  expect(store.saved.size).toBe(0)
})

test('a closed reply after uncertain delivery does not prove the original input was refused', async () => {
  const store = storage()
  let calls = 0
  const sender = createRunInputSender(store, async () => {
    if (++calls === 1) throw new Error('Lost acknowledgement')
    throw new TheoremError({
      statusCode: 409,
      body: { code: 'run_input_closed' },
    })
  })
  await sender.send('thread', 'run', 'Already delivered, perhaps')
  expect((await sender.retry('thread'))?.kind).toBe('unresolved')
  expect(store.saved.size).toBe(1)
  expect(sender.send('thread', 'new-run', 'Another')).toBeUndefined()
  expect(sender.reset('thread')).toBe(true)
  expect(calls).toBe(2)
  expect(sender.getState('thread')?.kind).toBe('released')
})

test('a receipt for the same words with a different key cannot acknowledge this input', async () => {
  const store = storage()
  const sender = createRunInputSender(store, async (envelope) => ({
    ...receipt(envelope),
    idempotencyKey: 'chat-command:some-other-send',
  }))
  expect((await sender.send('thread', 'run', 'Yes'))?.kind).toBe('unresolved')
  expect(store.saved.size).toBe(1)
})

test('durable reconciliation follows the exact key across pages and the same inputId to its final state', async () => {
  const envelope = { threadId: 'thread', runId: 'run', key: 'key', text: 'Yes' }
  const accepted = receipt(envelope)
  const latest = {
    ...receipt(envelope, 'not_delivered'),
    idempotencyKey: 'input-settled',
  }
  const cursors: number[] = []
  const proof = await findRunInputReceipt(envelope, async (after) => {
    cursors.push(after)
    return after === 0
      ? {
          runId: 'run',
          events: [receipt({ ...envelope, key: 'another' }), accepted],
          hasMore: true,
          nextAfterSeq: 100,
        }
      : { runId: 'run', events: [latest], hasMore: false, nextAfterSeq: 101 }
  })
  expect(cursors).toEqual([0, 100])
  expect(proof).toEqual({ accepted, latest })
  const store = storage()
  store.setItem('theorem.pending-run-input:thread', JSON.stringify(envelope))
  const sender = createRunInputSender(store, async () => proof)
  expect((await sender.retry('thread'))?.kind).toBe('closed')
})

test('history with matching words but no request key does not resolve delivery', async () => {
  const envelope = { threadId: 'thread', runId: 'run', key: 'key', text: 'Yes' }
  expect(
    await findRunInputReceipt(envelope, async () => ({
      runId: 'run',
      events: [receipt({ ...envelope, key: 'another' })],
      hasMore: false,
      nextAfterSeq: 1,
    })),
  ).toBeUndefined()
  await expect(
    findRunInputReceipt(envelope, async () => ({
      runId: 'run',
      events: [],
      hasMore: true,
      nextAfterSeq: 0,
    })),
  ).rejects.toThrow('did not advance')
})

test('reset stays blocked until saved delivery state can actually be cleared', async () => {
  const store = storage()
  store.setItem('theorem.pending-run-input:thread', '{bad json')
  let denied = true
  const sender = createRunInputSender(
    {
      ...store,
      removeItem: (key) => {
        if (denied) throw new Error('Storage denied')
        store.removeItem(key)
      },
    },
    async () => ({}),
  )
  expect(sender.reset('thread')).toBe(false)
  expect(sender.getState('thread')?.message).toContain('session storage')
  expect(sender.send('thread', 'run', 'New')).toBeUndefined()
  denied = false
  expect(sender.reset('thread')).toBe(true)
  expect(sender.getState('thread')?.kind).toBe('released')
})

let fetchSpy: ReturnType<typeof spyOn<typeof window, 'fetch'>> | undefined
afterEach(() => {
  fetchSpy?.mockRestore()
  fetchSpy = undefined
})

test('a fresh bootstrap aborts at 30 seconds before any input command is dispatched', async () => {
  const paths: string[] = []
  let signal!: AbortSignal
  let rejectFetch!: (error: Error) => void
  let started!: () => void
  const fetched = new Promise<void>((resolve) => {
    started = resolve
  })
  fetchSpy = spyOn(window, 'fetch').mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const request = new Request(input, init)
    paths.push(new URL(request.url).pathname)
    signal = request.signal
    return new Promise<Response>((_, reject) => {
      rejectFetch = reject
      signal.addEventListener(
        'abort',
        () => reject(new DOMException('Request aborted', 'AbortError')),
        { once: true },
      )
      started()
    })
  }) as typeof fetch)

  const realTimeout = globalThis.setTimeout
  const timers: Array<{
    at: number
    id: ReturnType<typeof setTimeout>
    fire: () => void
    fired: boolean
  }> = []
  let elapsed = 0
  const timeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(((
    callback: () => void,
    delay = 0,
  ) => {
    const id = realTimeout(callback, delay)
    timers.push({ at: elapsed + delay, id, fire: callback, fired: false })
    return id
  }) as typeof setTimeout)
  const advance = (milliseconds: number) => {
    elapsed += milliseconds
    for (const timer of timers) {
      if (timer.fired || timer.at > elapsed) continue
      timer.fired = true
      clearTimeout(timer.id)
      timer.fire()
    }
  }

  // Start a fresh handshake even when another test previously cached a token.
  const session = bootstrap(true).then(
    () => undefined,
    (error: unknown) => error,
  )
  const sender = createRunInputSender(storage(), dispatchRunInput)
  const sent = sender.send('bootstrap-thread', 'bootstrap-run', 'Keep working')
  try {
    await fetched
    advance(29_999)
    expect(signal.aborted).toBe(false)
    expect(sender.getState('bootstrap-thread')).toMatchObject({
      kind: 'unresolved',
      pending: true,
    })
    advance(1)
    expect(signal.aborted).toBe(true)
    expect(await session).toMatchObject({ name: 'TheoremTimeoutError' })
    expect(await sent).toMatchObject({ kind: 'unresolved', pending: false })
    expect(paths).toEqual(['/api/chat/v1/bootstrap'])
  } finally {
    rejectFetch(new Error('Test cleanup'))
    for (const timer of timers) clearTimeout(timer.id)
    timeoutSpy.mockRestore()
    await Promise.all([session, sent])
  }
})

test('the shipped SDK sends only an input command and keeps its key through CSRF refresh', async () => {
  const requests: Array<{ path: string; key: string | null; body: unknown }> =
    []
  const store = storage()
  fetchSpy = spyOn(window, 'fetch').mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path.endsWith('/bootstrap'))
      return Response.json({ csrfToken: 'fresh-csrf' })
    const body = await request.json()
    requests.push({ path, key: request.headers.get('Idempotency-Key'), body })
    expect(store.saved.size).toBe(1)
    if (requests.length === 1)
      return Response.json({ code: 'csrf' }, { status: 403 })
    const envelope = JSON.parse(
      [...store.saved.values()][0]!,
    ) as RunInputEnvelope
    return Response.json(receipt(envelope))
  }) as typeof fetch)
  const sender = createRunInputSender(store, dispatchRunInput)
  const text = '  Keep working; use B.\n\n'
  expect((await sender.send('sdk-thread', 'sdk-run', text))?.kind).toBe(
    'accepted',
  )
  expect(requests).toHaveLength(2)
  expect(requests[0]).toEqual({
    path: '/v1/theorem/agent/stream/sdk-run/commands',
    key: expect.any(String),
    body: { command: 'input', text },
  })
  expect(requests[1]).toEqual(requests[0])
})

test('the shipped SDK recovers a closed inbox from its exact durable acceptance event', async () => {
  const store = storage()
  let commands = 0
  let reads = 0
  let envelope!: RunInputEnvelope
  fetchSpy = spyOn(window, 'fetch').mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.pathname.endsWith('/bootstrap'))
      return Response.json({ csrfToken: 'csrf' })
    if (url.pathname.endsWith('/commands')) {
      commands++
      envelope = JSON.parse([...store.saved.values()][0]!) as RunInputEnvelope
      expect(request.headers.get('Idempotency-Key')).toBe(envelope.key)
      if (commands === 1) throw new TypeError('Lost response')
      return Response.json({ code: 'run_input_closed' }, { status: 409 })
    }
    expect(request.method).toBe('GET')
    expect(url.pathname).toBe('/api/chat/v1/runs/restarted-run')
    reads++
    return Response.json({
      runId: envelope.runId,
      events: [receipt(envelope)],
      hasMore: false,
      nextAfterSeq: 3,
    })
  }) as typeof fetch)
  const sender = createRunInputSender(store, dispatchRunInput)
  expect((await sender.send('thread', 'restarted-run', 'Use B'))?.kind).toBe(
    'unresolved',
  )
  expect((await sender.retry('thread'))?.kind).toBe('accepted')
  expect(commands).toBe(2)
  expect(reads).toBe(1)
  expect(store.saved.size).toBe(0)
})
