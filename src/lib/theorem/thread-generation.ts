// SOURCING: lib/theorem/client mutateThread (the revisioned thread write) and lib/theorem/passthrough theoremJson, because the vendored SDK's thread patch has no `generation` yet; lib/theorem/generation holds the override
import { mutateThread } from './client'
import { readGeneration, useGenerationOverrides } from './generation'
import { theoremJson } from './passthrough'

/**
 * Theorem's copy of a conversation's response override reaches the composer
 * when the thread loads. A change made here and not saved yet stays.
 */
export function takeThreadGeneration(thread: { threadId: string; generation?: unknown }) {
  useGenerationOverrides.getState().take(thread.threadId, readGeneration(thread.generation))
}

/**
 * Writes a changed override onto its thread, before a send reads the thread's
 * revision. A Theorem that refuses it, or cannot be reached, leaves the
 * override waiting: the turn then carries it itself, and the next send tries
 * again.
 */
export async function saveThreadGeneration(threadId: string) {
  const { byThread, unsaved, markSaved } = useGenerationOverrides.getState()
  if (!unsaved[threadId]) return
  // An override that was reset is `{}`, which clears the thread's.
  const generation = byThread[threadId] ?? {}
  try {
    await mutateThread(threadId, (headers) =>
      theoremJson(`/api/chat/v1/threads/${encodeURIComponent(threadId)}`, {
        method: 'PATCH',
        headers,
        body: { generation },
      }),
    )
    markSaved(threadId, generation)
  } catch {
    // Still unsaved, so `generationTurnOptions` sends it with the turn.
  }
}
