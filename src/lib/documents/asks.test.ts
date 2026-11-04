// SOURCING: bun:test over the ask runner with the real SDK client, send recovery
// and run tail. fetch is stubbed, as no Theorem is running.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test'
import { waitFor } from '../../../test/workspace'
import { useDocumentAsks } from './ask-store'
import { askAbout, resumeAsks, stopAsk } from './asks'
import type { AskedNote } from './asks'

type Send = { key: string; text: string }

const runIds = new Map<string, string>()
let sends: Send[] = []
let cancelled: string[] = []
/** Sends whose reply is lost after Theorem received them. */
let lostReplies = 0
/** What a send waits for before it is answered. */
let held: Promise<void> | undefined

/** A finished run, whose reply says which run wrote it. */
const events = (runId: string) =>
  [
    {
      seq: 1,
      sourceEventType: 'CHAT.MESSAGE.PART',
      payload: { part: { partId: 'p1', type: 'text', text: `From ${runId}` } },
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
    return new Response(events(path.split('/').at(-2)!), {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  if (path.endsWith('/cancel')) {
    cancelled.push(path.split('/').at(-2)!)
    return Response.json({})
  }
  if (path.endsWith('/messages') && request.method === 'POST') {
    const key = request.headers.get('Idempotency-Key') ?? ''
    const { text } = (await request.json()) as { text: string }
    sends.push({ key, text })
    await held
    if (lostReplies > 0) {
      lostReplies -= 1
      throw new TypeError('Network disconnected')
    }
    const runId = runIds.get(key) ?? `run-${runIds.size + 1}`
    runIds.set(key, runId)
    return Response.json({ run: { runId } }, { status: 201 })
  }
  return Response.json({
    thread: { selectedBranchId: 'branch-1', revision: 1 },
    messages: [],
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

/** A note with a conversation of its own, as each test's sends stay apart. */
function aNote(): AskedNote {
  const id = crypto.randomUUID()
  const note = {
    key: `note-${id}`,
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    path: 'note.md',
    title: 'Note',
    text: 'The whole note.',
  }
  useDocumentAsks.getState().setThread(note.key, `thread-${id}`)
  return note
}

const ask = (note: AskedNote, question: string, sendKey?: string) =>
  askAbout(
    note,
    question,
    { part: 'selected text', text: 'The whole' },
    { exact: 'The whole' },
    sendKey,
  )

const stored = (note: AskedNote, id: string) =>
  useDocumentAsks.getState().asks[note.key]?.find((known) => known.id === id)

const settled = (note: AskedNote, id: string, status: string) =>
  waitFor(() => stored(note, id)?.status === status)

beforeEach(() => {
  runIds.clear()
  sends = []
  cancelled = []
  lostReplies = 0
  held = undefined
})

describe('a send whose reply was lost', () => {
  test('is recovered for its ask before the next ask takes its turn', async () => {
    const note = aNote()
    lostReplies = 1
    const first = ask(note, 'First')
    await settled(note, first, 'failed')

    const second = ask(note, 'Second')
    await settled(note, second, 'done')

    expect(stored(note, first)).toMatchObject({
      status: 'done',
      runId: 'run-1',
      reply: 'From run-1',
    })
    expect(stored(note, first)?.error).toBeUndefined()
    expect(stored(note, second)).toMatchObject({
      runId: 'run-2',
      reply: 'From run-2',
    })
    const [lost, replay, next] = sends
    expect(sends.map((send) => send.text)).toEqual(['First', 'First', 'Second'])
    expect(replay?.key).toBe(lost?.key ?? '')
    expect(next?.key).not.toBe(lost?.key)
  })

  test('is what a retry follows, without asking again', async () => {
    const note = aNote()
    lostReplies = 1
    const first = ask(note, 'First')
    await settled(note, first, 'failed')

    const retry = ask(note, 'First', stored(note, first)?.sendKey)
    useDocumentAsks.getState().dismiss(note.key, first)
    await settled(note, retry, 'done')

    expect(stored(note, retry)).toMatchObject({
      runId: 'run-1',
      reply: 'From run-1',
    })
    expect(sends).toHaveLength(2)
    expect(sends[1]?.key).toBe(sends[0]?.key ?? '')
  })

  test.each(['failed', 'running'] as const)(
    'is recovered when the note opens again on a %s ask',
    async (status) => {
      const note = aNote()
      lostReplies = 1
      const first = ask(note, 'First')
      await settled(note, first, 'failed')
      useDocumentAsks.getState().patch(note.key, first, { status })

      resumeAsks(note.key)
      await settled(note, first, 'done')

      expect(stored(note, first)).toMatchObject({
        runId: 'run-1',
        reply: 'From run-1',
      })
    },
  )

  test('is cancelled when the person stopped its ask', async () => {
    const note = aNote()
    lostReplies = 1
    const first = ask(note, 'First')
    await settled(note, first, 'failed')
    stopAsk(note.key, first)

    const second = ask(note, 'Second')
    await settled(note, second, 'done')

    expect(stored(note, first)?.status).toBe('stopped')
    expect(stored(note, first)?.runId).toBeUndefined()
    expect(cancelled).toEqual(['run-1'])
    expect(stored(note, second)?.runId).toBe('run-2')
  })

  test('is cancelled when its ask was dismissed', async () => {
    const note = aNote()
    lostReplies = 1
    const first = ask(note, 'First')
    await settled(note, first, 'failed')
    useDocumentAsks.getState().dismiss(note.key, first)

    const second = ask(note, 'Second')
    await settled(note, second, 'done')

    expect(cancelled).toEqual(['run-1'])
    expect(stored(note, second)?.runId).toBe('run-2')
  })

  test('holds the next ask back, and says why, until a replay gets through', async () => {
    const note = aNote()
    lostReplies = 2
    const first = ask(note, 'First')
    await settled(note, first, 'failed')

    const second = ask(note, 'Second')
    await settled(note, second, 'failed')

    expect(stored(note, second)?.error).toBe(stored(note, first)?.error)
    expect(stored(note, second)?.error).not.toContain('awaiting recovery')
    expect(sends.map((send) => send.text)).toEqual(['First', 'First'])

    const third = ask(note, 'Third')
    await settled(note, third, 'done')

    expect(stored(note, first)?.runId).toBe('run-1')
    expect(stored(note, third)?.runId).toBe('run-2')
  })

  test('stops with its ask, even while the replay is under way', async () => {
    const note = aNote()
    lostReplies = 1
    const first = ask(note, 'First')
    await settled(note, first, 'failed')

    const { promise, resolve } = Promise.withResolvers<void>()
    held = promise
    resumeAsks(note.key)
    await waitFor(() => stored(note, first)?.status === 'running')
    stopAsk(note.key, first)
    resolve()

    const second = ask(note, 'Second')
    await settled(note, second, 'done')

    expect(stored(note, first)?.status).toBe('stopped')
    expect(cancelled).toEqual(['run-1'])
    expect(stored(note, second)?.runId).toBe('run-2')
  })
})

test('opening a note stops an ask that never reached Theorem', async () => {
  const note = aNote()
  const id = crypto.randomUUID()
  useDocumentAsks.getState().add(note.key, {
    id,
    question: 'First',
    passage: { exact: 'The whole' },
    part: 'selected text',
    reply: '',
    marks: [],
    edits: {},
    status: 'running',
  })

  resumeAsks(note.key)

  expect(stored(note, id)?.status).toBe('stopped')
  expect(sends).toHaveLength(0)
})
