// SOURCING: zustand + zustand/middleware persist (when this browser last had each thread on screen; Theorem keeps no read position to share across devices)
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SeenThreads = {
  /** When each thread was last on screen here, by thread id, in epoch ms. */
  at: Readonly<Record<string, number>>
  mark: (threadId: string, atMs: number) => void
}

export const useSeenThreads = create<SeenThreads>()(
  persist(
    (set) => ({
      at: {},
      mark: (threadId, atMs) =>
        set((state) => ({ at: { ...state.at, [threadId]: atMs } })),
    }),
    { name: 'theorem-seen-threads', version: 1 },
  ),
)

/** One look at a thread: when it was last seen before, and when this look began. */
export type Visit = { since: number | undefined; openedAt: number }

/**
 * The first reply that arrived while no one was looking: after the thread was
 * last on screen here, and before this look began. A reply that arrives during
 * the look is watched, not missed; a thread never seen here has nothing new.
 */
export function firstUnseen(
  messages: ReadonlyArray<{ id: string; role: string; createdAt: Date }>,
  { since, openedAt }: Visit,
): string | undefined {
  if (since === undefined) return undefined
  return messages.find((message) => {
    const at = message.createdAt.getTime()
    return message.role === 'assistant' && at > since && at <= openedAt
  })?.id
}
