// Exercise both shipped adapter entrypoints through the real generated HTTP client.
import { expect, test } from 'bun:test'
import { createRequire } from 'node:module'
import { TheoremClient } from '@theoremharness/sdk'
import { createTheoremChatAdapter } from '@theoremharness/sdk/assistant-ui'
import type { ChatModelRunOptions } from '@assistant-ui/react'

const require = createRequire(import.meta.url)
const cjs = require('@theoremharness/sdk/assistant-ui') as { createTheoremChatAdapter: typeof createTheoremChatAdapter }
const options = (signal = new AbortController().signal): ChatModelRunOptions => ({
  messages: [{ id: 'user-local', role: 'user', content: [{ type: 'text', text: 'Continue with the smaller design' }], attachments: [], metadata: { custom: {} }, createdAt: new Date() }],
  abortSignal: signal,
  runConfig: {},
}) as unknown as ChatModelRunOptions

function fixture(makeAdapter: typeof createTheoremChatAdapter, initiallyLive = false) {
  let linked = initiallyLive
  let terminal = false
  let reads = 0
  let cancels = 0
  let onLinkedRead: (() => void) | undefined
  const sends: Array<{ revision: string | null; key: string | null }> = []
  const transport = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path.endsWith('/bootstrap')) return Response.json({ csrfToken: 'csrf' })
    if (path.endsWith('/threads/thread')) {
      reads++
      if (linked) onLinkedRead?.()
      return Response.json({
        thread: { threadId: 'thread', status: 'regular', revision: linked ? 1 : 2, selectedBranchId: 'branch', ...(linked ? { activeRunId: 'run-1' } : {}) },
        messages: [],
        ...(linked ? { liveRun: { runId: 'run-1' } } : {}),
      })
    }
    if (path.endsWith('/runs/run-1')) return Response.json({ runId: 'run-1', terminal })
    if (path.endsWith('/messages')) {
      sends.push({ revision: request.headers.get('If-Match'), key: request.headers.get('Idempotency-Key') })
      linked = true
      return Response.json({ record: { messageId: 'user-durable' }, run: { runId: 'run-1' } }, { status: 201 })
    }
    if (path.endsWith('/events')) {
      terminal = true
      return new Response([
        { seq: 1, sourceEventType: 'CHAT.MESSAGE.PART', payload: { part: { partId: 'answer', type: 'text', text: 'Working from the revised plan.' } } },
        { seq: 2, sourceEventType: 'RUN.CLOSED', payload: {} },
      ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
    }
    if (path.endsWith('/cancel')) { cancels++; return Response.json({}) }
    throw new Error(`Unexpected request ${path}`)
  }, { preconnect: fetch.preconnect })
  const client = new TheoremClient({ baseUrl: 'https://example.test', auth: false, fetch: transport, maxRetries: 0 })
  const adapter = makeAdapter({ client, threadId: 'thread' })
  const stream = (signal?: AbortSignal) => {
    const result = adapter.run(options(signal))
    if (!(Symbol.asyncIterator in result)) throw new Error('Expected adapter stream')
    return result[Symbol.asyncIterator]()
  }
  return {
    stream, sends,
    reads: () => reads,
    cancels: () => cancels,
    release: () => { linked = false },
    finish: () => { terminal = true },
    onLinkedRead: (callback: () => void) => { onLinkedRead = callback },
  }
}

for (const [name, makeAdapter] of [['ESM', createTheoremChatAdapter], ['CommonJS', cjs.createTheoremChatAdapter]] as const) {
  test(`${name}: a terminal event cannot complete the UI while its thread still names that run`, async () => {
    const f = fixture(makeAdapter)
    const stream = f.stream()
    expect((await stream.next()).value).toMatchObject({ content: [{ type: 'text', text: 'Working from the revised plan.' }] })
    let linkedRead!: () => void
    const observed = new Promise<void>((resolve) => { linkedRead = resolve })
    f.onLinkedRead(linkedRead)
    let completed = false
    const next = stream.next().then((step) => { completed = true; return step })
    await observed
    expect(completed).toBe(false)
    f.release()
    expect((await next).value).toMatchObject({ status: { type: 'complete', reason: 'stop' } })
    await stream.next()
    expect(f.cancels()).toBe(0)
  })

  test(`${name}: a stale terminal liveRun is settled before the new send reads its revision`, async () => {
    const f = fixture(makeAdapter, true)
    f.finish()
    f.onLinkedRead(() => { if (f.reads() >= 2) f.release() })
    const stream = f.stream()
    await stream.next()
    expect(f.sends).toHaveLength(1)
    expect(f.sends[0]?.revision).toBe('2')
    f.release()
    await stream.next()
    await stream.next()
    expect(f.cancels()).toBe(0)
  })

  test(`${name}: a genuinely active run is never cancelled or admitted as an ordinary second run`, async () => {
    const f = fixture(makeAdapter, true)
    await expect(f.stream().next()).rejects.toThrow('active run')
    expect(f.sends).toHaveLength(0)
    expect(f.cancels()).toBe(0)
  })

  test(`${name}: stopping during terminal settlement ends the wait without cancelling a completed run`, async () => {
    const f = fixture(makeAdapter)
    const abort = new AbortController()
    const stream = f.stream(abort.signal)
    await stream.next()
    f.onLinkedRead(() => abort.abort())
    expect((await stream.next()).done).toBe(true)
    expect(f.cancels()).toBe(0)
  })
}
