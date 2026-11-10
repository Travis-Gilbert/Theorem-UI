// SOURCING: bun:test over the durable thread's history adapter and turn runner
// with the real SDK client and send recovery. fetch is stubbed, as no Theorem is
// running.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  spyOn,
  test,
} from 'bun:test'
import { useAui, useAuiState } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toastManager } from '@/components/coss/toast'
import { TheoremError } from '@theoremharness/sdk'
import type { ChatModelRunOptions } from '@assistant-ui/react'
import { act, createElement, useEffect, useState } from 'react'
import { cleanup, render, waitFor } from '../../../test/workspace'
import { usePlanning, useWebSearch } from '@/components/chat/composer-tools'
import { usePendingStyle, useSelectionMutation } from './response-styles'
import {
  mutateThread,
  pendingSendKey,
  takeRefusedText,
  theorem,
} from './client'
import {
  TheoremRuntimeProvider,
  createHistoryAdapter,
  createThreadListAdapter,
  runTurn,
  draftedPlan,
} from './runtime'

type Send = {
  key: string
  text: string
  capabilityScope?: string[]
  webResearch?: boolean
  planning?: boolean
  model?: { provider: string; model: string }
  executionMode?: string
  responseStyle?: string
}

let sends: Send[] = []
/** Whether the page may create threads, as a new chat's first message does; named in the order made. */
let createsThreads = false
let createdThreads = 0
/** Sends whose reply is lost after Theorem received them. */
let lostReplies = 0
/** How the next sends are answered, in place of a run. */
let answers: Array<Response | Promise<Response>> = []
/** Writes of a conversation's response style, and what each waits for before it is answered. */
let styleWrites = 0
let styleWriteGate: Promise<void> | undefined
/** The run a thread's snapshot says is live. */
let liveRunId: string | undefined
const titleThreads = new Map<string, { title: string; revision: number; text: string }>()
const inaccessibleTitles = new Set<string>()
let titleEvents: string[] = []
let concurrentTitle: string | undefined
let titleReadGate: (() => Promise<void>) | undefined
let titleReads: string[] = []

function titleSnapshot(threadId: string) {
  const saved = titleThreads.get(threadId)!
  return {
    thread: { threadId, title: saved.title, revision: saved.revision, status: 'regular', selectedBranchId: 'branch-1' },
    messages: saved.text ? [{ messageId: 'first-user', role: 'user', parts: [{ partId: 'text-1', type: 'text', payload: { text: saved.text } }] }] : [],
  }
}

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
  if (path.endsWith('/response-styles/selection')) {
    styleWrites += 1
    await styleWriteGate
    return Response.json({ conversation: 'theorem.style.formal' })
  }
  if (path.endsWith('/messages') && request.method === 'POST') {
    titleEvents.push(`send:${request.headers.get('If-Match')}`)
    const { text, capabilityScope, webResearch, planning, model, executionMode, responseStyle } =
      (await request.json()) as Omit<Send, 'key'>
    sends.push({
      key: request.headers.get('Idempotency-Key') ?? '',
      text,
      ...(capabilityScope ? { capabilityScope } : {}),
      ...(webResearch !== undefined ? { webResearch } : {}),
      ...(planning !== undefined ? { planning } : {}),
      ...(model ? { model } : {}),
      ...(executionMode ? { executionMode } : {}),
      ...(responseStyle ? { responseStyle } : {}),
    })
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
  if (createsThreads && path.endsWith('/threads') && request.method === 'POST')
    return Response.json(
      { record: { threadId: `created-${++createdThreads}` } },
      { status: 201 },
    )
  if (path.endsWith('/threads')) return Response.json({ items: [...titleThreads.keys()].map((id) => titleSnapshot(id).thread) })
  const threadId = path.split('/').pop()!
  if (inaccessibleTitles.has(threadId)) return Response.json({ code: 'forbidden' }, { status: 403 })
  if (titleThreads.has(threadId)) {
    if (request.method === 'PATCH') {
      titleEvents.push(`title:${request.headers.get('If-Match')}`)
      const saved = titleThreads.get(threadId)!
      if (concurrentTitle) {
        saved.title = concurrentTitle
        saved.revision += 1
        concurrentTitle = undefined
        return revisionConflict()
      }
      const body = await request.json() as { title: string }
      saved.title = body.title
      saved.revision += 1
      return Response.json({ record: titleSnapshot(threadId).thread })
    }
    titleReads.push(threadId)
    await titleReadGate?.()
    return Response.json(titleSnapshot(threadId))
  }
  return Response.json({
    thread: {
      threadId: path.split('/').pop(),
      status: 'regular',
      selectedBranchId: 'branch-1',
      revision: 1,
    },
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
  createsThreads = false
  createdThreads = 0
  lostReplies = 0
  answers = []
  styleWrites = 0
  styleWriteGate = undefined
  liveRunId = undefined
  titleThreads.clear()
  inaccessibleTitles.clear()
  titleEvents = []
  concurrentTitle = undefined
  titleReadGate = undefined
  titleReads = []
  useWebSearch.setState({ on: false })
  usePlanning.setState({ on: false })
  usePendingStyle.setState({ styleId: undefined, held: {} })
})
afterEach(cleanup)

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
    () => {
      const text = takeRefusedText(threadId)
      if (text) restored.push(text)
    },
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

  let accepted = 0
  await drain(
    runTurn(threadId, options('Hello'), undefined, () => {
      accepted += 1
    }),
  )
  expect(accepted).toBe(1)

  const [lost, replay, fresh] = sends
  expect(sends.map((send) => send.text)).toEqual(['Hello', 'Hello', 'Hello'])
  expect(replay?.key).toBe(lost?.key ?? '')
  expect(fresh?.key).not.toBe(lost?.key)
  expect(pendingSendKey(threadId)).toBeUndefined()
})

test('replaying a saved send does not consume the new composer context', async () => {
  const threadId = await threadWithLostSend()
  let accepted = 0
  await drain(
    runTurn(threadId, options('Hello'), undefined, () => {
      accepted += 1
    }),
  )
  expect(accepted).toBe(0)
  expect(sends.map((send) => send.text)).toEqual(['Hello', 'Hello'])
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

test('with no composer to take it, a refused text stays held for its thread', async () => {
  const threadId = await threadWithLostSend()
  answers = [revisionConflict()]

  await createHistoryAdapter(() => threadId).load()

  expect(takeRefusedText(threadId)).toBe('Hello')
  expect(takeRefusedText(threadId)).toBeUndefined()
})

/** The real thread list on one chat, with a way to switch to another. */
async function openChat(threadId: string) {
  let switchTo = (_: string) => {}
  function Composer() {
    const text = useAuiState((s) => s.composer.text)
    const open = useAuiState((s) => s.threadListItem.remoteId)
    return createElement('output', { 'data-open': open }, text)
  }
  function Chat() {
    const [open, setOpen] = useState(threadId)
    switchTo = setOpen
    return createElement(TheoremRuntimeProvider, {
      projectId: 'project',
      threadId: open,
      onThreadIdChange: () => {},
      children: createElement(Composer),
    })
  }
  const { container } = await render(createElement(Chat))
  const composer = () => container.querySelector('output')
  return {
    composer,
    async switchChat(to: string) {
      await act(async () => switchTo(to))
      await waitFor(() => composer()?.dataset.open === to)
    },
  }
}

test('a send refused in the open chat goes back in its composer', async () => {
  const threadId = await threadWithLostSend()
  answers = [revisionConflict()]

  const { composer } = await openChat(threadId)

  await waitFor(() => composer()?.textContent === 'Hello')
  expect(takeRefusedText(threadId)).toBeUndefined()
})

test('a send refused after its chat was left waits for that chat', async () => {
  const left = await threadWithLostSend()
  const other = `thread-${crypto.randomUUID()}`
  let refuse = () => {}
  answers = [
    new Promise<Response>((resolve) => {
      refuse = () => resolve(revisionConflict())
    }),
  ]

  const { composer, switchChat } = await openChat(left)
  await waitFor(() => sends.length === 2)
  await switchChat(other)
  refuse()
  await waitFor(() => pendingSendKey(left) === undefined)

  expect(composer()?.textContent).toBe('')

  await switchChat(left)
  await waitFor(() => composer()?.textContent === 'Hello')

  await switchChat(other)
  expect(composer()?.textContent).toBe('')
})


test.each<[boolean, boolean]>([
  [true, true],
  [true, false],
  [false, true],
  [false, false],
])('a send with Web %p and Plan %p keeps research additive', async (on, planning) => {
  useWebSearch.setState({ on })
  usePlanning.setState({ on: planning })
  const threadId = `thread-${crypto.randomUUID()}`
  function Sender() {
    const aui = useAui()
    useEffect(() => {
      aui.composer.setText('Latest Rust release')
      aui.composer.send()
    }, [aui])
    return null
  }
  await render(
    createElement(TheoremRuntimeProvider, {
      projectId: 'project',
      threadId,
      onThreadIdChange: () => {},
      children: createElement(Sender),
    }),
  )
  await waitFor(() => sends.length === 1)
  expect(sends[0]).toEqual({
    key: expect.any(String),
    text: 'Latest Rust release',
    ...(on ? { webResearch: true } : {}),
    ...(planning ? { planning: true } : {}),
  })
})

/** A chat the person types into, with its composer in hand. */
async function openComposer(threadId?: string) {
  createsThreads = !threadId
  const handle: { aui?: ReturnType<typeof useAui> } = {}
  function Probe() {
    handle.aui = useAui()
    return null
  }
  await render(
    createElement(TheoremRuntimeProvider, {
      projectId: 'project',
      threadId,
      onThreadIdChange: () => {},
      children: createElement(Probe),
    }),
  )
  const mounted = () => {
    if (!handle.aui) throw new Error('the chat did not mount')
    return handle.aui
  }
  return {
    say: (text: string) =>
      act(async () => {
        mounted().composer.setText(text)
        mounted().composer.send()
      }),
    idle: () => waitFor(() => !mounted().thread().getState().isRunning),
  }
}

test('the style picked for a new chat goes with its first message and no later one', async () => {
  usePendingStyle.getState().choose('theorem.style.concise')
  const { say, idle } = await openComposer()
  await say('Explain B-trees')
  await waitFor(() => sends.length === 1)
  expect(sends[0]).toEqual({
    key: expect.any(String),
    text: 'Explain B-trees',
    responseStyle: 'theorem.style.concise',
  })
  // The conversation holds the choice now, so the pick is spent.
  await waitFor(() => !('created-1' in usePendingStyle.getState().held))
  expect(usePendingStyle.getState().styleId).toBeUndefined()

  // A pick made after that is for the next new chat, not for this one.
  usePendingStyle.getState().choose('theorem.style.formal')
  await idle()
  await say('And skip lists?')
  await waitFor(() => sends.length === 2)
  expect(sends[1]?.responseStyle).toBeUndefined()
  expect(usePendingStyle.getState().styleId).toBe('theorem.style.formal')
})

test('a chat that already exists never sends a pending style', async () => {
  usePendingStyle.getState().choose('theorem.style.formal')
  const { say } = await openComposer(`thread-${crypto.randomUUID()}`)
  await say('Hello')
  await waitFor(() => sends.length === 1)
  expect(sends[0]?.responseStyle).toBeUndefined()
  expect(usePendingStyle.getState().styleId).toBe('theorem.style.formal')
})

test('a new chat with no pick sends no style', async () => {
  const { say } = await openComposer()
  await say('Hello')
  await waitFor(() => sends.length === 1)
  expect(Object.keys(sends[0]!)).toEqual(['key', 'text'])
})

test('a lost first send is replayed with the style it went out with, and spends the pick once', async () => {
  usePendingStyle.getState().choose('theorem.style.concise')
  lostReplies = 1
  const { say } = await openComposer()
  await say('Explain B-trees')
  await waitFor(() => sends.length === 2)
  expect(sends[1]?.key).toBe(sends[0]?.key)
  expect(sends.map((send) => send.responseStyle)).toEqual([
    'theorem.style.concise',
    'theorem.style.concise',
  ])
  await waitFor(() => !('created-1' in usePendingStyle.getState().held))
  expect(usePendingStyle.getState().styleId).toBeUndefined()
})

test('a first message that is refused leaves the pick with its chat, and the next one carries it', async () => {
  usePendingStyle.getState().choose('theorem.style.concise')
  answers = [revisionConflict()]
  const { say, idle } = await openComposer()
  await say('Explain B-trees')
  await waitFor(() => sends.length === 1)
  expect(sends[0]?.responseStyle).toBe('theorem.style.concise')
  await idle()
  // The chat was made for that message, so the pick is its own now, and the next new chat starts without one.
  expect(usePendingStyle.getState()).toMatchObject({
    styleId: undefined,
    held: { 'created-1': 'theorem.style.concise' },
  })

  await say('Explain B-trees')
  await waitFor(() => sends.length === 2)
  expect(sends[1]?.responseStyle).toBe('theorem.style.concise')
  expect(sends[1]?.key).not.toBe(sends[0]?.key)
  // Accepted this time: the conversation holds the choice, and no later message carries it.
  await waitFor(() => !('created-1' in usePendingStyle.getState().held))
  await idle()
  await say('And skip lists?')
  await waitFor(() => sends.length === 3)
  expect(sends[2]?.responseStyle).toBeUndefined()
})

test("a message sent while its chat's style is still being written waits for that write", async () => {
  const threadId = `thread-${crypto.randomUUID()}`
  let kept = () => {}
  styleWriteGate = new Promise<void>((resolve) => {
    kept = resolve
  })
  const handle: {
    aui?: ReturnType<typeof useAui>
    select?: ReturnType<typeof useSelectionMutation>
  } = {}
  function Probe() {
    handle.aui = useAui()
    handle.select = useSelectionMutation()
    return null
  }
  await render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(TheoremRuntimeProvider, {
        projectId: 'project',
        threadId,
        onThreadIdChange: () => {},
        children: createElement(Probe),
      }),
    ),
  )
  const say = (text: string) =>
    act(async () => {
      handle.aui!.composer.setText(text)
      handle.aui!.composer.send()
    })
  const idle = () =>
    waitFor(() => !handle.aui!.thread().getState().isRunning)

  // With no choice on its way a message goes out at once.
  await say('Hello')
  await waitFor(() => sends.length === 1)
  await idle()

  await act(async () =>
    handle.select!.mutate({
      scope: 'conversation',
      threadId,
      style: 'theorem.style.formal',
    }),
  )
  await waitFor(() => styleWrites === 1)
  await say('Explain B-trees')
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(sends).toHaveLength(1)

  await act(async () => kept())
  await waitFor(() => sends.length === 2)
  // The conversation's choice was kept before the turn began, so the turn names none of its own.
  expect(sends[1]).toEqual({ key: expect.any(String), text: 'Explain B-trees' })
})

test('existing New Chat rows get meaningful projected titles without revision writes', async () => {
  titleThreads.set('title-old', {
    title: 'New Chat',
    revision: 1,
    text: 'Compare SQLite and PostgreSQL',
  })
  titleThreads.set('title-custom', {
    title: 'My database notes',
    revision: 2,
    text: 'An older prompt',
  })
  titleThreads.set('title-inaccessible', {
    title: 'New Chat',
    revision: 1,
    text: 'Private',
  })
  inaccessibleTitles.add('title-inaccessible')
  const adapter = createThreadListAdapter(() => 'project')
  const page = await adapter.list()
  expect(page.threads.map((thread) => thread.title)).toEqual([
    'Compare SQLite and PostgreSQL',
    'My database notes',
    'New Chat',
  ])
  expect((await adapter.fetch('title-old')).title).toBe(
    'Compare SQLite and PostgreSQL',
  )
  expect(titleEvents).toEqual([])
  expect(titleReads).not.toContain('title-custom')
})

test.each(['New Chat', ''])(
  'automatic title generation is read-only for %j',
  async (title) => {
    titleThreads.set('title-stream', { title, revision: 1, text: '' })
    const stream = await createThreadListAdapter(() => 'project').generateTitle(
      'title-stream',
      options('Plan a small notes app').messages,
    )
    const reader = stream.getReader()
    let text = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (value.type === 'text-delta') text += value.textDelta
    }
    expect(text).toBe('Plan a small notes app')
    expect(titleEvents).toEqual([])
  },
)

test('durable automatic title is written before the revision-checked SDK send', async () => {
  const threadId = `title-run-${crypto.randomUUID()}`
  titleThreads.set(threadId, { title: 'New Chat', revision: 1, text: '' })
  await drain(runTurn(threadId, options('Plan a small notes app')))
  expect(titleThreads.get(threadId)?.title).toBe('Plan a small notes app')
  expect(titleEvents).toEqual(['title:1', 'send:2'])
})

test('a concurrent custom rename wins over automatic naming', async () => {
  const threadId = `title-rename-${crypto.randomUUID()}`
  titleThreads.set(threadId, { title: 'New Chat', revision: 1, text: '' })
  concurrentTitle = 'My chosen title'
  await drain(runTurn(threadId, options('Plan a small notes app')))
  expect(titleThreads.get(threadId)?.title).toBe('My chosen title')
  expect(titleEvents).toEqual(['title:1', 'send:2'])
})

test('old title recovery bounds concurrent history reads', async () => {
  for (let index = 0; index < 9; index += 1) {
    titleThreads.set(`title-bound-${index}`, {
      title: 'New Chat',
      revision: 1,
      text: `Question ${index}`,
    })
  }
  let active = 0
  let peak = 0
  const releases: Array<() => void> = []
  titleReadGate = async () => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise<void>((resolve) => releases.push(resolve))
    active -= 1
  }
  const pending = createThreadListAdapter(() => 'project').list()
  await waitFor(() => titleReads.length === 4)
  expect(active).toBe(4)
  releases.splice(0).forEach((release) => release())
  await waitFor(() => titleReads.length === 8)
  releases.splice(0).forEach((release) => release())
  await waitFor(() => titleReads.length === 9)
  releases.splice(0).forEach((release) => release())
  expect((await pending).threads).toHaveLength(9)
  expect(peak).toBe(4)
  expect(titleEvents).toEqual([])
})

test('only a finished draft_plan call turns Plan off', () => {
  const call = (toolName: string, extra: Record<string, unknown>) => ({
    content: [{ type: 'tool-call', toolCallId: 'c', toolName, args: {}, argsText: '{}', ...extra }],
  }) as unknown as Parameters<typeof draftedPlan>[0]
  expect(draftedPlan(call('draft_plan', { result: { planId: 'plan:1' } }))).toBe(true)
  expect(draftedPlan(call('draft_plan', {}))).toBe(false)
  expect(draftedPlan(call('draft_plan', { result: 'a cycle', isError: true }))).toBe(false)
  expect(draftedPlan(call('web_search', { result: {} }))).toBe(false)
  expect(draftedPlan({})).toBe(false)
})

// A cached SDK adapter may first be created by the terminal, then used by chat.
test('each surface sends its current model and mode on a shared durable thread', async () => {
  const threadId = 'switch-model-after-terminal'
  await drain(runTurn(threadId, options('Terminal first'), { executionMode: 'coding' }))
  await drain(runTurn(threadId, options('Chat second'), { model: { provider: 'openrouter', model: 'deepseek/new-model' } }))
  expect(sends[1]?.model).toEqual({ provider: 'openrouter', model: 'deepseek/new-model' })
  expect(sends[1]?.executionMode).toBeUndefined()
  await drain(runTurn(threadId, options('Default third')))
  expect(sends[2]?.model).toBeUndefined()
})

test('research and planning retain an explicit caller capability scope', async () => {
  const request = {
    ...options('Research within my allowed tools'),
    runConfig: { custom: { theoremTurnOptions: { capabilityScope: ['web_read'], webResearch: true, planning: true } } },
  }
  await drain(runTurn(`scoped-research-${crypto.randomUUID()}`, request))
  expect(sends[0]?.webResearch).toBe(true)
  expect(sends[0]?.planning).toBe(true)
  expect(sends[0]?.capabilityScope).toEqual(['web_read'])
})


test('new chat creation failures are visible and still reject admission', async () => {
  const failure = new TheoremError({ statusCode: 500, body: {
    code: 'chat_store_error', detail: 'tenant_memory_quota_exceeded: tenant memory quota exceeded: projected 805853256 > quota 805306368', correlationId: 'chatreq-capacity',
  } })
  const createThread = spyOn(theorem().chat.threads, 'create').mockRejectedValue(failure)
  const notify = spyOn(toastManager, 'add').mockReturnValue('capacity-toast')
  try {
    await expect(createThreadListAdapter(() => 'project').initialize('local-chat')).rejects.toBe(failure)
    expect(notify).toHaveBeenCalledWith({ type: 'error', title: 'Could not confirm chat creation', description: 'The chat store reached its configured memory budget. The server operator must restore capacity before this request can succeed. Reference: chatreq-capacity' })
    expect(sends).toHaveLength(0)
  } finally { createThread.mockRestore(); notify.mockRestore() }
})


test('a lost thread-creation reply does not claim that the thread was not saved', async () => {
  const failure = new TypeError('Network disconnected')
  const createThread = spyOn(theorem().chat.threads, 'create').mockRejectedValue(failure)
  const notify = spyOn(toastManager, 'add').mockReturnValue('transport-toast')
  try {
    await expect(createThreadListAdapter(() => 'project').initialize('local-chat')).rejects.toBe(failure)
    expect(notify).toHaveBeenCalledWith({ type: 'error', title: 'Could not confirm chat creation', description: 'Network disconnected' })
  } finally { createThread.mockRestore(); notify.mockRestore() }
})
