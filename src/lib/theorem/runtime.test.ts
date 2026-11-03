// SOURCING: bun:test over the durable thread's history adapter and turn runner
// with the real SDK client and send recovery. fetch is stubbed, as no Theorem is
// running.
import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from 'bun:test'
import type { ChatModelRunOptions } from '@assistant-ui/react'
import { mutateThread, pendingSendKey, theorem } from './client'
import { createHistoryAdapter, runTurn } from './runtime'

type Send = { key: string; text: string }

let sends: Send[] = []
/** Sends whose reply is lost after Theorem received them. */
let lostReplies = 0
/** How the next sends are answered, in place of a run. */
let answers: Response[] = []
/** The run a thread's snapshot says is live. */
let liveRunId: string | undefined

const revisionConflict = () =>
  Response.json(
    {
      code: 'chat_revision_conflict',
      title: 'The chat changed before this mutation was committed',
      detail: 'chat revision conflict: expected 1, current 2',
    },
    { status: 409 },
  )

const closedRun = [
  {
    seq: 1,
    sourceEventType: 'CHAT.MESSAGE.PART',
    payload: { part: { partId: 'p1', type: 'text', text: 'Answered' } },
  },
  { seq: 2, sourceEventType: 'RUN.CLOSED', payload: {} },
]
  .map((event) => `data: ${JSON.stringify(event)}\n\n`)
  .join('')

async function theoremApi(input: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(input, init)
  const path = new URL(request.url).pathname
  if (path.endsWith('/bootstrap'))
    return Response.json({ csrfToken: 'csrf', tenantId: 't' })
  if (path.endsWith('/events')) {
    return new Response(closedRun, {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  if (path.endsWith('/messages') && request.method === 'POST') {
    const { text } = (await request.json()) as { text: string }
    sends.push({ key: request.headers.get('Idempotency-Key') ?? '', text })
    if (lostReplies > 0) {
      lostReplies -= 1
      throw new TypeError('Network disconnected')
    }
    return (
      answers.shift() ??
      Response.json(
        { record: { messageId: 'message-1' }, run: { runId: 'run-1' } },
        { status: 201 },
      )
    )
  }
  return Response.json({
    thread: { selectedBranchId: 'branch-1', revision: 1 },
    messages: [],
    ...(liveRunId ? { liveRun: { runId: liveRunId } } : {}),
  })
}

const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
let fetchSpy: ReturnType<typeof spyOn>
beforeAll(() => {
  page.setURL('http://localhost:3000/')
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    theoremApi as typeof fetch,
  )
})
afterAll(() => {
  fetchSpy.mockRestore()
  page.setURL('about:blank')
})
beforeEach(() => {
  sends = []
  lostReplies = 0
  answers = []
  liveRunId = undefined
})

/** A thread with a send saved for recovery, because its reply was lost. */
async function threadWithLostSend(text = 'Hello') {
  const threadId = `thread-${crypto.randomUUID()}`
  lostReplies = 1
  await mutateThread(threadId, (headers) =>
    theorem().chat.messages.send({
      ...headers,
      threadId,
      branchId: 'branch-1',
      text,
    }),
  ).catch(() => undefined)
  expect(pendingSendKey(threadId)).toBeDefined()
  return threadId
}

const options = (text: string) =>
  ({
    messages: [
      {
        id: 'local-user',
        role: 'user',
        content: [{ type: 'text', text }],
        attachments: [],
      },
    ],
    abortSignal: new AbortController().signal,
    runConfig: {},
  }) as unknown as ChatModelRunOptions

async function drain(steps: AsyncIterable<unknown>) {
  for await (const _ of steps) {
    /* consume */
  }
}

/** Loads on one adapter and resumes on another, as assistant-ui may. */
async function loaded(threadId: string) {
  const restored: string[] = []
  const repository = await createHistoryAdapter(
    () => threadId,
    (text) => restored.push(text),
  ).load()
  const resume = createHistoryAdapter(() => threadId).resume?.(options(''))
  return { repository, restored, resume: resume ?? (async function* () {})() }
}

test('a reload whose saved send is refused says why and gives the text back', async () => {
  const threadId = await threadWithLostSend()
  answers = [revisionConflict()]

  const { repository, restored, resume } = await loaded(threadId)

  expect(repository.unstable_resume).toBe(true)
  await expect(drain(resume)).rejects.toThrow(
    'Your message was not sent. The chat changed before this mutation was committed',
  )
  expect(restored).toEqual(['Hello'])
  expect(pendingSendKey(threadId)).toBeUndefined()
})

test('a reload whose saved send has no verdict keeps it and gives nothing back', async () => {
  const threadId = await threadWithLostSend()
  answers = [Response.json({ code: 'rate_limited' }, { status: 429 })]

  const { restored, resume } = await loaded(threadId)

  await expect(drain(resume)).rejects.toThrow()
  expect(restored).toEqual([])
  expect(pendingSendKey(threadId)).toBeDefined()
})

test('a reload reattaches to the run left live', async () => {
  const threadId = `thread-${crypto.randomUUID()}`
  liveRunId = 'run-live'

  const { repository, resume } = await loaded(threadId)

  expect(repository.unstable_resume).toBe(true)
  const steps: unknown[] = []
  for await (const step of resume) steps.push(step)
  expect(JSON.stringify(steps)).toContain('Answered')
})

test('a send after a refused replay goes out as the new turn', async () => {
  const threadId = await threadWithLostSend()
  answers = [revisionConflict()]

  await drain(runTurn(threadId, options('Hello')))

  const [lost, replay, fresh] = sends
  expect(sends.map((send) => send.text)).toEqual(['Hello', 'Hello', 'Hello'])
  expect(replay?.key).toBe(lost?.key ?? '')
  expect(fresh?.key).not.toBe(lost?.key)
  expect(pendingSendKey(threadId)).toBeUndefined()
})

test('a send stays refused while the saved one has no verdict', async () => {
  const threadId = await threadWithLostSend()
  answers = [Response.json({ code: 'rate_limited' }, { status: 429 })]

  await expect(drain(runTurn(threadId, options('Hello')))).rejects.toThrow()
  await expect(drain(runTurn(threadId, options('Different')))).rejects.toThrow(
    'previous message',
  )

  expect(sends.map((send) => send.text)).toEqual(['Hello', 'Hello'])
  expect(pendingSendKey(threadId)).toBeDefined()
})
