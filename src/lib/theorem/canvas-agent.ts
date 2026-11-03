// SOURCING: @theoremharness/sdk chat client (threads.create, messages.send with spaceContext, runs.cancel) and the runtime's tailRun
//
// Each canvas request is its own conversation in the project, so the chat
// thread's adapter options stay untouched. The server admits the referenced
// objects from the saved Space but hands the agent only their identities, so
// the excerpts travel inline in the message text as well.
import { mutate, theorem } from './client'
import { tailRun } from './runtime'

export type CanvasSource = {
  documentId: string
  title: string
  /** The note's Markdown when the request is about the whole note. */
  markdown: string
  /** Placement on the saved Space; unplaced notes go inline only. */
  placementId?: string
  /** A text selection inside the note. */
  selection?: { quote: string; start: number; end: number; revision: string }
}

export type CanvasAction = { id: string; label: string; prompt: string }

export const CANVAS_ACTIONS: readonly CanvasAction[] = [
  { id: 'summarize', label: 'Summarize', prompt: 'Summarize this.' },
  { id: 'explain', label: 'Explain', prompt: 'Explain this clearly.' },
  {
    id: 'connections',
    label: 'Find connections',
    prompt: 'Find the connections, tensions and shared ideas across this.',
  },
  {
    id: 'critique',
    label: 'Critique',
    prompt:
      'Critique this: weak claims, gaps, and what would make it stronger.',
  },
  {
    id: 'continue',
    label: 'Continue writing',
    prompt: 'Continue writing from where this leaves off, in the same voice.',
  },
]

const EXCERPT_LIMIT = 6000
/** Server limits on one request's references. */
const MAX_SELECTED = 64
const MAX_LOCATORS = 256

function excerpt(source: CanvasSource): string {
  const body = source.selection?.quote ?? source.markdown
  return body.length > EXCERPT_LIMIT
    ? `${body.slice(0, EXCERPT_LIMIT)}\n\n[truncated]`
    : body
}

export function messageText(prompt: string, sources: readonly CanvasSource[]) {
  if (!sources.length) return prompt
  const context = sources
    .map(
      (s) =>
        `### ${s.title} (${s.documentId})${s.selection ? ', selected text' : ''}\n\n${excerpt(s)}`,
    )
    .join('\n\n')
  return `${prompt}\n\nContext from the canvas:\n\n${context}`
}

/** The chat spaceContext for the sources that are placed on the saved Space. */
export function spaceContextFor(
  spaceId: string,
  sources: readonly CanvasSource[],
) {
  const placed = sources.filter((s) => s.placementId)
  if (!placed.length) return undefined
  const selected = [
    ...new Map(
      placed.map((s) => [s.documentId, { kind: 'document', id: s.documentId }]),
    ).values(),
  ].slice(0, MAX_SELECTED)
  const locators = placed
    .filter((s) => s.selection)
    .slice(0, MAX_LOCATORS)
    .map((s) => ({
      object: { kind: 'document', id: s.documentId },
      revision: s.selection!.revision,
      placement: s.placementId,
      at: {
        text_range: {
          start: s.selection!.start,
          end: s.selection!.end,
          quote: s.selection!.quote.slice(0, 4096),
        },
      },
    }))
  return {
    space: spaceId,
    selected,
    ...(locators.length ? { locators } : {}),
  }
}

/** Text parts of a streamed assistant message. */
function textOf(content: readonly { type: string; text?: string }[]) {
  return content
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text)
    .join('\n\n')
}

export type CanvasRunUpdate = {
  threadId: string
  runId: string
  text: string
  done: boolean
  failed: boolean
}

/** Start a conversation for one canvas request and stream its answer. */
export async function* askOnCanvas({
  projectId,
  spaceId,
  prompt,
  sources,
  signal,
}: {
  projectId: string
  spaceId: string
  prompt: string
  sources: readonly CanvasSource[]
  signal: AbortSignal
}): AsyncGenerator<CanvasRunUpdate, void> {
  const title = sources.length
    ? `${prompt.split('\n')[0]!.slice(0, 40)}: ${sources[0]!.title}`
    : prompt.split('\n')[0]!.slice(0, 60)
  const { record: thread } = await mutate((headers) =>
    theorem().chat.threads.create({ projectId, title, ...headers }),
  )
  const spaceContext = spaceContextFor(spaceId, sources)
  const turn = await mutate((headers) =>
    theorem().chat.messages.send({
      ...headers,
      'If-Match': String(thread.revision),
      threadId: thread.threadId,
      branchId: thread.selectedBranchId,
      text: messageText(prompt, sources),
      ...(spaceContext ? { spaceContext } : {}),
    }),
  )
  const { runId } = turn.run
  let settled = false
  try {
    for await (const step of tailRun(runId, signal)) {
      const text = textOf(step.content as { type: string; text?: string }[])
      settled = step.status !== undefined
      yield {
        threadId: thread.threadId,
        runId,
        text,
        done: settled,
        failed: step.status?.type === 'incomplete',
      }
    }
  } finally {
    if (!settled && signal.aborted)
      await mutate((headers) =>
        theorem().chat.runs.cancel({
          runId,
          ...headers,
          reason: 'Stopped from the Theorem UI canvas',
        }),
      ).catch(() => undefined)
  }
}
