// SOURCING: @theoremharness/sdk's chat client (threads.create, messages.send
// with contextReferences, runs.cancel) and the runtime's tailRun, as
// lib/theorem/canvas-agent.ts runs its asks; the ask store (ask-store.ts).
//
// Each note has one durable conversation, made on its first ask and kept
// apart from the chats, so a later ask can lean on an earlier one. An ask is
// a turn on it that carries the passage and the note as context references.
// The note keeps the reply and the agent's marks, and the run id, so a reply
// still streaming when the page reloads is picked up again. A send whose reply
// was lost is replayed before the next turn, or when the note opens again.
import {
  describeError,
  mutate,
  mutateThread,
  pendingSendKey,
  recoverPendingSend,
  theorem,
} from '@/lib/theorem/client'
import type { Theorem } from '@/lib/theorem/client'
import { pickedModel } from '@/lib/theorem/models'
import { tailRun } from '@/lib/theorem/runtime'
import type { ChatModelRunResult } from '@assistant-ui/react'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { fromBase64 } from '@/lib/blocks/state'
import { noteMarkdown } from '@/lib/theorem/note-canonical'
import { splitFrontmatter } from '@/components/handlers/markdown/frontmatter'
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
  /** Immutable editor content captured at Ask, compared with the canonical source before pinning. */
  documentSource?: {
    documentId: string
    doc: ProseNode
    parse: (markdown: string) => ProseNode
  }
}

const store = () => useDocumentAsks.getState()
/** Asks run one at a time per note, as a conversation takes one turn at a time. */
const queues = new Map<string, Promise<unknown>>()
const stops = new Map<string, AbortController>()

function enqueue(key: string, turn: () => Promise<unknown>) {
  queues.set(key, (queues.get(key) ?? Promise.resolve()).then(turn, turn))
}

const cancelRun = (runId: string) =>
  mutate((headers) =>
    theorem().chat.runs.cancel({
      runId,
      ...headers,
      reason: 'Stopped from the Theorem UI document screen',
    }),
  ).catch(() => undefined)

/** An ask the person stopped stays stopped, whatever its run did after. */
function failAsk(key: string, id: string, error: unknown) {
  const ask = store().asks[key]?.find((known) => known.id === id)
  if (ask?.status === 'stopped') return
  store().patch(key, id, { status: 'failed', error: describeError(error) })
}

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
      await cancelRun(runId)
    }
  }
}

/**
 * A send whose reply was lost stays saved, and the client refuses any other
 * send on the thread until it is replayed. Replaying it under its own key gets
 * the turn Theorem already started, or starts it, so the ask that sent it
 * follows that run; a run nobody is waiting for any more is cancelled. A send
 * Theorem refuses for good is over, with no run: it fails its ask and frees the
 * note. Returns the id of the ask whose run it followed.
 */
async function recoverSend(key: string) {
  const threadId = store().threads[key]
  const sendKey = threadId ? pendingSendKey(threadId) : undefined
  if (!threadId || !sendKey) return undefined
  const ask = store().asks[key]?.find((known) => known.sendKey === sendKey)
  if (!ask || ask.status === 'stopped') {
    try {
      const runId = await recoverPendingSend(threadId)
      if (runId) await cancelRun(runId)
    } catch (error) {
      // Still saved, so the next send would be refused; this is why.
      if (pendingSendKey(threadId)) throw error
    }
    return undefined
  }
  const running = stops.get(ask.id)
  const stop = running ?? new AbortController()
  stops.set(ask.id, stop)
  store().patch(key, ask.id, { status: 'running', error: undefined })
  let runId: string | undefined
  try {
    runId = await recoverPendingSend(threadId)
    if (runId) {
      store().patch(key, ask.id, { runId })
      await follow(key, ask.id, runId, stop.signal)
    }
  } catch (error) {
    failAsk(key, ask.id, error)
    // Still saved, so the next send would be refused; this is why.
    if (pendingSendKey(threadId)) throw error
  } finally {
    // A retry's own stop still has its fresh send to stop.
    if (!running) stops.delete(ask.id)
  }
  return runId ? ask.id : undefined
}

async function canonicalSource(note: AskedNote, signal: AbortSignal) {
  const source = note.documentSource
  if (!source) return undefined
  const snapshot = await theorem().documents.snapshot(
    { documentId: source.documentId, schema: 'theorem-document/2' },
    { abortSignal: signal },
  )
  const markdown =
    snapshot.canonical.placement === 'inline'
      ? noteMarkdown(fromBase64(snapshot.canonical.bytesBase64))
      : undefined
  if (
    markdown === undefined ||
    !source.doc.eq(source.parse(splitFrontmatter(markdown).body))
  )
    throw new Error(
      'The selected note differs from its saved document. Save or refresh the note, then select the passage again.',
    )
  return snapshot.summary
}

async function run(
  note: AskedNote,
  id: string,
  question: string,
  excerpt: Excerpt,
  signal: AbortSignal,
) {
  try {
    // A retry's lost send is its own, so its replay's run is the whole turn.
    if ((await recoverSend(note.key)) === id || signal.aborted) return
    store().patch(note.key, id, { status: 'running', error: undefined })
    const document = await canonicalSource(note, signal)
    const threadId = await threadFor(note)
    const { thread } = await theorem().chat.threads.get({ threadId })
    const turn = await mutateThread(threadId, (headers) => {
      store().patch(note.key, id, { sendKey: headers['Idempotency-Key'] })
      return theorem().chat.messages.send({
        ...headers,
        threadId,
        branchId: thread.selectedBranchId,
        text: question,
        // The generated SDK union still lacks document locations; its wire
        // client preserves this shared SDK reference shape unchanged.
        contextReferences: askReferences(
          note,
          excerpt,
          document,
        ) as Theorem.ChatContextReference[],
        model: pickedModel(),
      })
    })
    store().patch(note.key, id, { runId: turn.run.runId })
    await follow(note.key, id, turn.run.runId, signal)
  } catch (error) {
    failAsk(note.key, id, error)
  }
}

/**
 * Asks the agent `question` about `excerpt`, quoted as `passage`, in the
 * note's conversation. Returns the ask's id; its reply streams into the store.
 * A retry passes the key of the send it repeats, whose reply may have been lost.
 */
export function askAbout(
  note: AskedNote,
  question: string,
  excerpt: Excerpt,
  passage: Quote,
  sendKey?: string,
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
    sendKey,
  })
  const stop = new AbortController()
  stops.set(id, stop)
  enqueue(note.key, () =>
    run(note, id, question, excerpt, stop.signal).finally(() =>
      stops.delete(id),
    ),
  )
  return id
}

/** Stops an ask: a queued one never runs, a running one is cancelled. */
export function stopAsk(key: string, id: string) {
  stops.get(id)?.abort()
  store().patch(key, id, { status: 'stopped' })
}

/**
 * Picks up the note's asks that were streaming when the page last closed, and
 * recovers a send whose reply was lost; one that never reached Theorem is
 * stopped.
 */
export function resumeAsks(key: string) {
  const threadId = store().threads[key]
  const sendKey = threadId ? pendingSendKey(threadId) : undefined
  for (const ask of store().asks[key] ?? []) {
    if (ask.status !== 'queued' && ask.status !== 'running') continue
    if (stops.has(ask.id)) continue
    if (!ask.runId) {
      if (!sendKey || ask.sendKey !== sendKey)
        store().patch(key, ask.id, { status: 'stopped' })
      continue
    }
    const stop = new AbortController()
    stops.set(ask.id, stop)
    void follow(key, ask.id, ask.runId, stop.signal)
      .catch((error) => failAsk(key, ask.id, error))
      .finally(() => stops.delete(ask.id))
  }
  if (sendKey) enqueue(key, () => recoverSend(key).catch(() => undefined))
}
