// SOURCING: @theoremharness/sdk chat client (threads.create, messages.send with spaceContext, runs.cancel) and the runtime's tailRun
//
// Each canvas request is its own conversation in the project, so the chat
// thread's adapter options stay untouched. Canonical document references pin
// the saved sources for the front and workers; Space references retain placement.
import type { TheoremContextReference } from '@theoremharness/sdk'
import { mutate, theorem } from './client'
import type { Theorem } from './client'
import { tailRun } from './runtime'

export type CanvasSource = {
  documentId: string
  title: string
  /** The note's Markdown when the request is about the whole note. */
  markdown: string
  savedMarkdown: string
  revision: Theorem.DocumentRevision
  /** Placement on the saved Space; unplaced notes still carry document context. */
  placementId?: string
  /** A text selection inside the note. */
  selection?: { quote: string; range?: { start: number; end: number } }
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

/** Server limits on one request's references. */
const MAX_SELECTED = 64
const MAX_LOCATORS = 256

function contextReferencesFor(
  sources: readonly CanvasSource[],
): TheoremContextReference[] {
  return sources.map((source) => {
    if (source.markdown !== source.savedMarkdown)
      throw new Error(
        'The selected note has unsaved changes. Save or refresh the note, then select it again.',
      )
    return {
      location: {
        resource: { kind: 'graph-object', objectId: source.documentId },
        revision: String(source.revision.position),
      },
      label: source.title,
      excerpt: source.selection?.quote,
    }
  })
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
    .filter((s) => s.selection?.range)
    .slice(0, MAX_LOCATORS)
    .map((s) => ({
      object: { kind: 'document', id: s.documentId },
      revision: String(s.revision.position),
      placement: s.placementId,
      at: {
        text_range: {
          start: s.selection!.range!.start,
          end: s.selection!.range!.end,
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
  const contextReferences = contextReferencesFor(sources)
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
      text: prompt,
      ...(contextReferences.length
        ? {
            contextReferences:
              contextReferences as Theorem.ChatContextReference[],
          }
        : {}),
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
