// SOURCING: React effects over ConversationState; ./from-thread and ./live
import { useEffect, useRef } from 'react'
import type { ConversationState } from '@theoremharness/sdk'
import { config } from '@/lib/config'
import { activityOfConversation } from './from-thread'
import { liveActivities } from './live'

/**
 * While a conversation is observed, its run is an activity on the phone's
 * system surfaces. Unmounting does nothing to the run or to the Live
 * Activity: the phone keeps showing the last thing it knew, marked stale.
 */
export function useTaskPresence(threadId: string, state: ConversationState): void {
  const seen = useRef<{ runId: string; generation: number }>(undefined)
  const runId = state.journal?.runId
  const revision = state.snapshot?.thread.revision
  const events = state.journal?.events.length ?? 0
  useEffect(() => {
    if (!runId || revision === undefined) return
    if (seen.current?.runId !== runId)
      seen.current = { runId, generation: Math.max(revision, (seen.current?.generation ?? -1) + 1) }
    const activity = activityOfConversation(config.authority, state, seen.current.generation, Date.now())
    if (!activity) return
    void liveActivities.show(activity, { threadId, url: `theorem://chat/${encodeURIComponent(threadId)}` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, runId, revision, events, state.phase])
}
