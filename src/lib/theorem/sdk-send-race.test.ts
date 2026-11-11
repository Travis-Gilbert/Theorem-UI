import { expect, test } from 'bun:test'
import { createTheoremChatAdapter } from '@theoremharness/sdk/assistant-ui'
import { TheoremClient } from '@theoremharness/sdk'
import type { ChatModelRunOptions } from '@assistant-ui/react'
import type { Theorem } from './client'

function snapshot(): Theorem.ThreadSnapshot {
  return {
    thread: {
      schema: 'theorem.chat.thread.v1',
      threadId: 'thread',
      tenantId: 'owner',
      projectId: 'project',
      title: 'Research',
      status: 'regular',
      selectedBranchId: 'branch',
      activeRunId: null,
      activeRunCursor: 0,
      pendingTurn: null,
      revision: 89,
      createdAtMs: 1,
      updatedAtMs: 2,
    },
    project: { projectId: 'project' },
    branches: [{ branchId: 'branch' }],
    selectedBranch: { branchId: 'branch' },
    messages: [
      {
        schema: 'theorem.chat.message.v1',
        messageId: 'front',
        tenantId: 'owner',
        threadId: 'thread',
        originBranchId: 'branch',
        role: 'assistant',
        runId: 'front-run',
        createdAtMs: 2,
        parts: [
          {
            partId: 'text',
            type: 'text',
            payload: { text: 'The builder is working.' },
          },
        ],
      },
    ],
  } as Theorem.ThreadSnapshot
}

function completed(before: Theorem.ThreadSnapshot): Theorem.ThreadSnapshot {
  return {
    ...structuredClone(before),
    thread: {
      ...before.thread,
      revision: 90,
      updatedAtMs: 3,
      lastMessageAtMs: 3,
    },
    messages: [
      ...structuredClone(before.messages),
      {
        ...structuredClone(before.messages[0]!),
        messageId: 'completion',
        parentMessageId: 'front',
        runId: 'delivery-run',
        createdAtMs: 3,
        parts: [
          {
            partId: 'done',
            type: 'text',
            payload: { text: 'The App is ready.' },
          },
        ],
      },
    ],
  }
}

const options = (): ChatModelRunOptions =>
  ({
    messages: [
      {
        id: 'local-user',
        role: 'user',
        content: [{ type: 'text', text: 'What was my priority?' }],
        attachments: [],
        metadata: { custom: {} },
        createdAt: new Date(),
      },
    ],
    abortSignal: new AbortController().signal,
    runConfig: {
      custom: {
        theoremTurnOptions: {
          model: 'selected-model',
          contextReferences: [
            { resource: { kind: 'document', id: 'selected-app' } },
          ],
        },
      },
    },
  }) as unknown as ChatModelRunOptions

type Fixture = {
  after?: (before: Theorem.ThreadSnapshot) => Theorem.ThreadSnapshot
  before?: Theorem.ThreadSnapshot
  respond?: (attempt: number) => Response | undefined
  adapter?: typeof createTheoremChatAdapter
}

const conflict = () =>
  Response.json(
    {
      code: 'chat_revision_conflict',
      title: 'Chat changed',
      detail: 'expected 89, current 90',
    },
    { status: 409 },
  )

async function fixture({
  after = completed,
  before = snapshot(),
  respond = (attempt) => (attempt === 1 ? conflict() : undefined),
  adapter: makeAdapter = createTheoremChatAdapter,
}: Fixture = {}) {
  const requests: Array<{
    path: string
    key: string | null
    revision: string | null
    body: unknown
  }> = []
  let reads = 0
  const transport = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      if (path.endsWith('/bootstrap'))
        return Response.json({ csrfToken: 'csrf' })
      if (path.endsWith('/threads/thread'))
        return Response.json(reads++ === 0 ? before : after(before))
      if (
        path.endsWith('/messages') ||
        path.endsWith('/retry') ||
        path.endsWith('/edit')
      ) {
        requests.push({
          path,
          key: request.headers.get('Idempotency-Key'),
          revision: request.headers.get('If-Match'),
          body: await request.json(),
        })
        const refusal = respond(requests.length)
        if (refusal) return refusal
        return Response.json(
          {
            record: { messageId: 'accepted-user' },
            run: { runId: 'accepted-run' },
          },
          { status: 201 },
        )
      }
      if (path.endsWith('/events'))
        return new Response(
          'data: {"seq":1,"sourceEventType":"CHAT.MESSAGE.PART","payload":{"part":{"partId":"answer","type":"text","text":"Privacy."}}}\n\ndata: {"seq":2,"sourceEventType":"RUN.CLOSED","payload":{}}\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        )
      throw new Error(`Unexpected request ${path}`)
    },
    { preconnect: fetch.preconnect },
  )
  const client = new TheoremClient({
    baseUrl: 'https://example.test',
    auth: false,
    fetch: transport,
    maxRetries: 0,
  })
  const adapter = makeAdapter({ client, threadId: 'thread' })
  const run = async (input = options()) => {
    const result = adapter.run(input)
    if (!(Symbol.asyncIterator in result))
      throw new Error('Expected SDK stream')
    const steps = []
    for await (const step of result) steps.push(step)
    return steps
  }
  return { run, requests, reads: () => reads }
}

test('the shipped adapter retries one refused send after an exact background-completion advance', async () => {
  const f = await fixture()
  const steps = await f.run()
  expect(JSON.stringify(steps)).toContain('Privacy.')
  expect(f.requests).toHaveLength(2)
  expect(f.requests.map((request) => request.revision)).toEqual(['89', '90'])
  expect(f.requests[0]!.key).not.toBe(f.requests[1]!.key)
  expect(f.requests[0]!.body).toEqual(f.requests[1]!.body)
  expect(f.requests[1]!.body).toMatchObject({
    text: 'What was my priority?',
    branchId: 'branch',
    model: 'selected-model',
    contextReferences: [{ resource: { kind: 'document', id: 'selected-app' } }],
  })
})

test.each([
  [
    'title changes',
    (s: Theorem.ThreadSnapshot) => {
      s.thread.title = 'Renamed'
    },
  ],
  [
    'selected branch changes',
    (s: Theorem.ThreadSnapshot) => {
      s.thread.selectedBranchId = 'other'
    },
  ],
  [
    'project scope changes',
    (s: Theorem.ThreadSnapshot) => {
      s.thread.projectId = 'other'
    },
  ],
  [
    'tenant changes',
    (s: Theorem.ThreadSnapshot) => {
      s.thread.tenantId = 'other'
    },
  ],
  [
    'viewed branch changes',
    (s: Theorem.ThreadSnapshot) => {
      s.viewedBranchId = 'other'
    },
  ],
  [
    'branch metadata changes',
    (s: Theorem.ThreadSnapshot) => {
      s.selectedBranch.parentBranchId = 'other'
    },
  ],
  [
    'old message edited',
    (s: Theorem.ThreadSnapshot) => {
      s.messages[0]!.parts[0]!.payload = { text: 'Edited' }
    },
  ],
  [
    'intervening user turn',
    (s: Theorem.ThreadSnapshot) => {
      s.messages[1]!.role = 'user'
    },
  ],
  [
    'unrelated assistant parent',
    (s: Theorem.ThreadSnapshot) => {
      s.messages[1]!.parentMessageId = 'unrelated'
    },
  ],
  [
    'missing delivery run',
    (s: Theorem.ThreadSnapshot) => {
      delete s.messages[1]!.runId
    },
  ],
  [
    'empty delivery run',
    (s: Theorem.ThreadSnapshot) => {
      s.messages[1]!.runId = ''
    },
  ],
  [
    'non-advancing revision',
    (s: Theorem.ThreadSnapshot) => {
      s.thread.revision = 89
    },
  ],
  [
    'active run',
    (s: Theorem.ThreadSnapshot) => {
      s.thread.activeRunId = 'active'
    },
  ],
  [
    'live run',
    (s: Theorem.ThreadSnapshot) => {
      s.liveRun = { runId: 'active' } as Theorem.RunLink
    },
  ],
  [
    'pending turn',
    (s: Theorem.ThreadSnapshot) => {
      s.thread.pendingTurn = {
        runId: 'pending',
      } as unknown as Theorem.PendingTurn
    },
  ],
] as const)('the SDK refuses to rebase when %s', async (_, change) => {
  const f = await fixture({
    after: (before) => {
      const next = completed(before)
      change(next)
      return next
    },
  })
  await expect(f.run()).rejects.toMatchObject({ statusCode: 409 })
  expect(f.requests).toHaveLength(1)
})

test('a revision advance without a background answer is not a retry opportunity', async () => {
  const f = await fixture({
    after: (before) => ({
      ...before,
      thread: { ...before.thread, revision: 90 },
    }),
  })
  await expect(f.run()).rejects.toMatchObject({ statusCode: 409 })
  expect(f.requests).toHaveLength(1)
})

test('a second definitive conflict is surfaced without a third send', async () => {
  const f = await fixture({ respond: () => conflict() })
  await expect(f.run()).rejects.toMatchObject({ statusCode: 409 })
  expect(f.requests).toHaveLength(2)
})

test.each([
  [503, 'chat_run_start_pending'],
  [409, 'idempotency_conflict'],
  [500, 'chat_store_error'],
  [400, 'chat_revision_conflict'],
])('status %i / %s is never a fresh-send retry', async (status, code) => {
  const f = await fixture({
    respond: () => Response.json({ code }, { status }),
  })
  await expect(f.run()).rejects.toMatchObject({ statusCode: status })
  expect(f.requests).toHaveLength(1)
  expect(f.reads()).toBe(1)
})

test('an ambiguous lost response is not sent again under a fresh identity', async () => {
  const f = await fixture({
    respond: () => {
      throw new TypeError('Connection lost')
    },
  })
  await expect(f.run()).rejects.toThrow()
  expect(f.requests).toHaveLength(1)
})

test('cancelling after refusal prevents reread and retry', async () => {
  const controller = new AbortController()
  const f = await fixture({
    respond: () => {
      controller.abort()
      return conflict()
    },
  })
  await f.run({ ...options(), abortSignal: controller.signal })
  expect(f.requests).toHaveLength(1)
  expect(f.reads()).toBe(1)
})

test.each(['retry', 'edit'])(
  'the SDK never automatically rebases an existing message %s',
  async (kind) => {
    const before = snapshot()
    const input = options()
    before.messages.unshift({
      ...before.messages[0]!,
      messageId: 'local-user',
      role: 'user',
      parts: [
        {
          partId: 'user',
          type: 'text',
          payload: {
            text: kind === 'retry' ? 'What was my priority?' : 'Old wording',
          },
        },
      ],
    })
    const f = await fixture({ before })
    await expect(f.run(input)).rejects.toMatchObject({ statusCode: 409 })
    expect(f.requests).toHaveLength(1)
    expect(f.requests[0]!.path).toEndWith('/' + kind)
    expect(f.reads()).toBe(1)
  },
)

test('the CommonJS adapter uses the same guarded retry owner', async () => {
  const commonjs = require('@theoremharness/sdk/assistant-ui') as {
    createTheoremChatAdapter: typeof createTheoremChatAdapter
  }
  const f = await fixture({ adapter: commonjs.createTheoremChatAdapter })
  expect(JSON.stringify(await f.run())).toContain('Privacy.')
  expect(f.requests).toHaveLength(2)
})

test('cancelling during the authoritative reread prevents the second send', async () => {
  const controller = new AbortController()
  const f = await fixture({
    after: (before) => {
      controller.abort()
      return completed(before)
    },
  })
  await f.run({ ...options(), abortSignal: controller.signal })
  expect(f.requests).toHaveLength(1)
  expect(f.reads()).toBe(2)
})

test('a chain of background completions permits only the same one retry', async () => {
  const f = await fixture({
    after: (before) => {
      const next = completed(before)
      next.thread.revision = 91
      next.messages.push({
        ...next.messages[1]!,
        messageId: 'second-completion',
        parentMessageId: 'completion',
        runId: 'second-delivery',
      })
      return next
    },
  })
  await f.run()
  expect(f.requests.map((request) => request.revision)).toEqual(['89', '91'])
  expect(f.requests).toHaveLength(2)
})

test.each(['empty', 'user'] as const)(
  'a %s history cannot authorize background-only rebasing',
  async (kind) => {
    const before = snapshot()
    if (kind === 'empty') before.messages = []
    else before.messages[0]!.role = 'user'
    const f = await fixture({ before })
    await expect(f.run()).rejects.toMatchObject({ statusCode: 409 })
    expect(f.requests).toHaveLength(1)
  },
)
