// SOURCING: @theoremharness/sdk chat.attention.list; chat.sidebar.seeThread (the seen route the web client calls when a thread opens), setLater and wakeThread (Theorem's Later, the same state the web client uses)
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

/**
 * Sets an update aside until `atMs` with Theorem's Later, the same state the
 * web client's Later uses, so it comes back everywhere at once. Throws when
 * the server does not confirm; the row stays until it does.
 */
export function snooze(threadId: string, atMs: number): Promise<unknown> {
  return mutate(Crypto.randomUUID(), (headers) =>
    theorem().chat.sidebar.setLater({ threadId, condition: { kind: 'time', atMs }, ...headers }),
  )
}

/** Undo for `snooze`: wakes the thread now, which lists its updates again. */
export function unsnooze(threadId: string): Promise<unknown> {
  return mutate(Crypto.randomUUID(), (headers) => theorem().chat.sidebar.wakeThread({ threadId, ...headers }))
}
