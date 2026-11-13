// SOURCING: @theoremharness/sdk chat.attention.list and chat.sidebar.seeThread (the same seen route the web client calls when a thread opens)
import * as Crypto from 'expo-crypto'
import { mutate, statusOf, theorem, type Theorem } from '@/lib/theorem'

export function loadFeed(): Promise<Theorem.ChatAttentionFeed> {
  return theorem().chat.attention.list()
}

/** The server does not serve the feed: an older authority, not a failure of this request. */
export const feedUnserved = (error: unknown) => statusOf(error) === 404 || statusOf(error) === 405

/**
 * Records that the person looked at the thread, which removes its updates
 * from the feed everywhere. Best effort: the next read of the feed is the
 * truth, so a failure is not shown as if the update had been cleared.
 */
export async function markSeen(threadId: string): Promise<void> {
  try {
    await mutate(Crypto.randomUUID(), (headers) => theorem().chat.sidebar.seeThread({ threadId, ...headers }))
  } catch {
    // The row stays in the feed until a later read says otherwise.
  }
}
