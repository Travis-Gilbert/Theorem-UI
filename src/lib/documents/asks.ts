// SOURCING: @theoremharness/sdk's chat client (threads.create, messages.send
// with contextReferences, runs.cancel) and the runtime's tailRun, as
// lib/theorem/canvas-agent.ts runs its asks; the ask store (ask-store.ts).
//
// Each note has one durable conversation, made on its first ask and kept
// apart from the chats, so a later ask can lean on an earlier one. An ask is
// a turn on it that carries the passage and the note as context references.
// The note keeps the reply and the agent's marks, and the run id, so a reply
// still streaming when the page reloads is picked up again.
import {
  describeError,
  mutate,
  mutateThread,
  theorem,
} from '@/lib/theorem/client'
import { pickedModelTurnOptions } from '@/lib/theorem/models'
import { tailRun } from '@/lib/theorem/runtime'
import type { ChatModelRunResult } from '@assistant-ui/react'
import { useDocumentAsks } from './ask-store'
import type { Ask } from './ask-store'
import { marksOf, replyOf } from './marks'
import type { Quote } from './marks'
import { askReferences } from './passage'
import type { Excerpt } from './passage'

export type AskedNote = {
  key: string
  projectId: string
  workspaceId: string
  path: string
  title: string
  /** The note's text as the agent quotes it. */
  text: string
}

const store = () => useDocumentAsks.getState()
/** Asks run one at a time per note, as a conversation takes one turn at a time. */
const queues = new Map<string, Promise<void>>()
const stops = new Map<string, AbortController>()

async function threadFor(note: AskedNote) {
  const known = store().threads[note.key]
  if (known) return known
  const { record } = await mutate((headers) =>
    theorem().chat.threads.create({
      projectId: note.projectId,
      title: note.title,
      ...headers,
    }),
  )
  store().setThread(note.key, record.threadId)
  return record.threadId
}

type RunStatus = NonNullable<ChatModelRunResult['status']>

/** What a run's last status makes of the ask, or nothing while it runs. */
function outcome(status: RunStatus | undefined): Partial<Ask> | undefined {
  if (status?.type === 'complete') return { status: 'done' }
  if (status?.type !== 'incomplete') return undefined
  if (status.reason === 'cancelled') return { status: 'stopped' }
  return {
    status: 'failed',
    error: typeof status.error === 'string' ? status.error : undefined,
  }
}

/** Streams a run's reply and marks into the ask until the run ends. */
async function follow(
  key: string,
  id: string,
  runId: string,
  signal: AbortSignal,
) {
  let settled = false
  try {
    for await (const step of tailRun(runId, signal)) {
      const content = step.content as Parameters<typeof marksOf>[0]
      const ended = outcome(step.status)
      settled ||= ended !== undefined
      store().patch(key, id, {
        reply: replyOf(content),
        marks: marksOf(content),
        ...ended,
      })
    }
  } finally {
    if (!settled && signal.aborted) {
      store().patch(key, id, { status: 'stopped' })
      await mutate((headers) =>
        theorem().chat.runs.cancel({
          runId,
          ...headers,
          reason: 'Stopped from the Theorem UI document screen',
        }),
      ).catch(() => undefined)
    }
  }
}

async function run(
  note: AskedNote,
  id: string,
  question: string,
  excerpt: Excerpt,
  signal: AbortSignal,
) {
  if (signal.aborted) return
  store().patch(note.key, id, { status: 'running' })
  try {
    const threadId = await threadFor(note)
    const { thread } = await theorem().chat.threads.get({ threadId })
    const turn = await mutateThread(threadId, (headers) =>
      theorem().chat.messages.send({
        ...headers,
        threadId,
        branchId: thread.selectedBranchId,
        text: question,
        contextReferences: askReferences(note, excerpt),
        model: pickedModelTurnOptions.model,
      }),
    )
    store().patch(note.key, id, { runId: turn.run.runId })
    await follow(note.key, id, turn.run.runId, signal)
  } catch (error) {
    // An ask the person stopped stays stopped, whatever its run did after.
    const ask = store().asks[note.key]?.find((known) => known.id === id)
    if (ask?.status === 'stopped') return
    store().patch(note.key, id, {
      status: 'failed',
      error: describeError(error),
    })
  }
}

/**
 * Asks the agent `question` about `excerpt`, quoted as `passage`, in the
 * note's conversation. Returns the ask's id; its reply streams into the store.
 */
export function askAbout(
  note: AskedNote,
  question: string,
  excerpt: Excerpt,
  passage: Quote,
): string {
  const id = crypto.randomUUID()
  store().add(note.key, {
    id,
    question,
    passage,
    part: excerpt.part,
    reply: '',
    marks: [],
    edits: {},
    status: 'queued',
  })
  const stop = new AbortController()
  stops.set(id, stop)
  const next = () => run(note, id, question, excerpt, stop.signal)
  const queued = (queues.get(note.key) ?? Promise.resolve()).then(next, next)
  queues.set(
    note.key,
    queued.finally(() => stops.delete(id)),
  )
  return id
}

/** Stops an ask: a queued one never runs, a running one is cancelled. */
export function stopAsk(key: string, id: string) {
  stops.get(id)?.abort()
  store().patch(key, id, { status: 'stopped' })
}

/**
 * Picks up the note's asks that were streaming when the page last closed;
 * one that never reached Theorem is stopped.
 */
export function resumeAsks(key: string) {
  for (const ask of store().asks[key] ?? []) {
    if (ask.status !== 'queued' && ask.status !== 'running') continue
    if (stops.has(ask.id)) continue
    if (!ask.runId) {
      store().patch(key, ask.id, { status: 'stopped' })
      continue
    }
    const stop = new AbortController()
    stops.set(ask.id, stop)
    void follow(key, ask.id, ask.runId, stop.signal)
      .catch((error) =>
        store().patch(key, ask.id, {
          status: 'failed',
          error: describeError(error),
        }),
      )
      .finally(() => stops.delete(ask.id))
  }
}
