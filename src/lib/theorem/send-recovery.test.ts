import { expect, test } from 'bun:test'
import { TheoremClient } from '@theoremharness/sdk'
import { createTheoremChatAdapter } from '@theoremharness/sdk/assistant-ui'
import type { ChatModelRunOptions } from '@assistant-ui/react'
import { createSendRecovery } from './send-recovery'

function storageFixture() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
    values,
  }
}

const options = {
  messages: [
    {
      id: 'local-user',
      role: 'user',
      content: [{ type: 'text', text: 'Hello' }],
      attachments: [],
    },
  ],
  abortSignal: new AbortController().signal,
} as unknown as ChatModelRunOptions

test('the real SDK adapter keeps a partial send replayable after reload', async () => {
  const storage = storageFixture()
  const requests: Request[] = []
  let failStart = true
  const transport = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      if (path.endsWith('/bootstrap'))
        return Response.json({ csrfToken: 'old-csrf' })
      if (path.endsWith('/threads/thread-1'))
        return Response.json({
          thread: { selectedBranchId: 'branch-1', revision: 1 },
          messages: [],
        })
      requests.push(request.clone())
      return failStart
        ? Response.json(
            {
              code: 'chat_run_start_pending',
              detail: 'temporarily unavailable',
            },
            { status: 503 },
          )
        : Response.json({ run: { runId: 'run-1' } }, { status: 201 })
    },
    { preconnect: fetch.preconnect },
  )
  const recovery = createSendRecovery(storage, transport)
  const client = new TheoremClient({
    baseUrl: 'https://example.test',
    auth: false,
    fetch: recovery.fetch,
    maxRetries: 0,
  })
  const adapter = createTheoremChatAdapter({ client, threadId: 'thread-1' })
  const consume = async () => {
    const result = adapter.run(options)
    if (!(Symbol.asyncIterator in result)) {
      await result
      return
    }
    for await (const _ of result) {
      /* consume */
    }
  }
  await expect(consume()).rejects.toThrow()
  expect(requests).toHaveLength(1)
  expect(recovery.has('thread-1')).toBe(true)
  expect([...storage.values.values()].join()).not.toContain('old-csrf')

  // A fresh recovery owner represents a browser reload. Keep the original
  // body, key and precondition, while refreshing only the session's CSRF.
  failStart = false
  const reloaded = createSendRecovery(storage, transport)
  expect(
    await reloaded.resume('thread-1', 'https://example.test', 'new-csrf'),
  ).toBe('run-1')
  expect(await requests[1]!.text()).toBe(await requests[0]!.text())
  expect(requests[1]!.headers.get('Idempotency-Key')).toBe(
    requests[0]!.headers.get('Idempotency-Key'),
  )
  expect(requests[1]!.headers.get('If-Match')).toBe('1')
  expect(requests[1]!.headers.get('X-CSRF-Token')).toBe('new-csrf')
  expect(reloaded.has('thread-1')).toBe(false)
})

test('recovery survives expired auth and refuses replacement text', async () => {
  const storage = storageFixture()
  let status = 503
  const transport = Object.assign(
    async () =>
      Response.json(
        {
          code:
            status === 503
              ? 'chat_run_start_pending'
              : 'authentication_required',
        },
        { status },
      ),
    { preconnect: fetch.preconnect },
  )
  const recovery = createSendRecovery(storage, transport)
  await recovery.fetch(
    'https://example.test/api/chat/v1/threads/thread-1/messages',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': 'stable-key', 'If-Match': '1' },
      body: JSON.stringify({ text: 'Hello', branchId: 'branch-1' }),
    },
  )
  status = 401
  await expect(
    recovery.resume('thread-1', 'https://example.test', 'csrf'),
  ).rejects.toThrow()
  expect(recovery.has('thread-1')).toBe(true)
  await expect(
    recovery.resume('thread-1', 'https://example.test', 'csrf', 'Different'),
  ).rejects.toThrow('previous message')
})

test('definitive initial rejection clears the journal, network ambiguity retains it', async () => {
  const storage = storageFixture()
  let unavailable = false
  const transport = Object.assign(
    async () => {
      if (unavailable) throw new TypeError('Network disconnected')
      return Response.json({ code: 'chat_scope_required' }, { status: 403 })
    },
    { preconnect: fetch.preconnect },
  )
  const recovery = createSendRecovery(storage, transport)
  const send = () =>
    recovery.fetch(
      'https://example.test/api/chat/v1/threads/thread-1/messages',
      {
        method: 'POST',
        headers: { 'Idempotency-Key': 'stable-key', 'If-Match': '1' },
        body: JSON.stringify({ text: 'Hello', branchId: 'branch-1' }),
      },
    )
  await send()
  expect(recovery.has('thread-1')).toBe(false)
  unavailable = true
  await expect(send()).rejects.toThrow('Network disconnected')
  expect(recovery.has('thread-1')).toBe(true)
})

test('known precommit 503 allows a corrected send', async () => {
  const storage = storageFixture()
  const transport = Object.assign(
    async () =>
      Response.json({ code: 'chat_model_credential_missing' }, { status: 503 }),
    { preconnect: fetch.preconnect },
  )
  const recovery = createSendRecovery(storage, transport)
  await recovery.fetch(
    'https://example.test/api/chat/v1/threads/thread-1/messages',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': 'stable-key', 'If-Match': '1' },
      body: JSON.stringify({ text: 'Hello', branchId: 'branch-1' }),
    },
  )
  expect(recovery.has('thread-1')).toBe(false)
})

test('aborting recovery preserves its identity for the next reload', async () => {
  const storage = storageFixture()
  let hang = false
  const transport = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      if (!hang)
        return Response.json(
          { code: 'chat_run_start_pending' },
          { status: 503 },
        )
      return new Promise<Response>((_, reject) => {
        request.signal.addEventListener(
          'abort',
          () => reject(request.signal.reason),
          { once: true },
        )
      })
    },
    { preconnect: fetch.preconnect },
  )
  const recovery = createSendRecovery(storage, transport)
  await recovery.fetch(
    'https://example.test/api/chat/v1/threads/thread-1/messages',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': 'stable-key', 'If-Match': '1' },
      body: JSON.stringify({ text: 'Hello', branchId: 'branch-1' }),
    },
  )
  hang = true
  const controller = new AbortController()
  const pending = recovery.resume(
    'thread-1',
    'https://example.test',
    'csrf',
    undefined,
    controller.signal,
  )
  await new Promise((resolve) => setTimeout(resolve, 10))
  controller.abort()
  await expect(pending).rejects.toThrow()
  expect(recovery.has('thread-1')).toBe(true)
})
