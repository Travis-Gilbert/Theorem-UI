// SOURCING: @theoremharness/sdk ConversationState (phase, snapshot.thread, journal.runId, projection.approvals) and Theorem.Thread (activeRunId, revision, title)
//
// A Theorem conversation's run, as an activity. Everything here is read from
// what Theorem gave the app; a thread with no run is not an activity.
import type { ConversationPhase, ConversationState, Theorem } from '@theoremharness/sdk'
import type { Action, Activity, Phase, Standing } from './activity'

const PHASES: Partial<Record<ConversationPhase, Phase>> = {
  running: 'working',
  reconnecting: 'working',
  'requires-action': 'waiting',
  completed: 'done',
  cancelled: 'stopped',
  interrupted: 'stopped',
  failed: 'failed',
}

const STATUS: Record<Phase, string> = {
  pending: 'Starting',
  working: 'Working',
  waiting: 'Needs your choice',
  done: 'Finished',
  failed: 'Stopped with an error',
  stopped: 'Stopped',
}

export const threadActivityId = (threadId: string) => `theorem-thread:${threadId}`

/**
 * The activity of an observed conversation, or undefined when it has no run.
 * `generation` counts nothing the phone made up: it is the thread revision at
 * which this run was first seen, supplied by the caller, so a later run of the
 * same thread outranks an earlier one. `revision` is the count of run events.
 */
export function activityOfConversation(
  authority: string,
  state: ConversationState,
  generation: number,
  nowMs: number,
): Activity | undefined {
  const thread = state.snapshot?.thread
  const runId = state.journal?.runId
  const phase = PHASES[state.phase]
  if (!thread || !runId || !phase) return undefined
  const events = state.journal?.events.length ?? 0
  const standing: Standing = phase === 'waiting' ? 'needs-you' : phase === 'working' ? 'in-hand' : 'settled'
  const actions: Action[] =
    phase === 'working' ? ['open', 'steer', 'stop'] : phase === 'waiting' ? ['open', 'answer', 'stop'] : ['open']
  return {
    activityId: threadActivityId(thread.threadId),
    generation,
    revision: events,
    environment: { kind: 'theorem', authority },
    title: thread.title.trim() || 'New conversation',
    status: STATUS[phase],
    phase,
    standing,
    signals: [{ name: 'run.events', value: events, observedAtMs: nowMs }],
    actions,
  }
}

/** A thread the list reports as running, before any conversation is opened on it. */
export function activityOfThread(authority: string, thread: Theorem.Thread, nowMs: number): Activity | undefined {
  if (!thread.activeRunId) return undefined
  return {
    activityId: threadActivityId(thread.threadId),
    generation: thread.revision,
    revision: thread.activeRunCursor,
    environment: { kind: 'theorem', authority },
    title: thread.title.trim() || 'New conversation',
    status: STATUS.working,
    phase: 'working',
    standing: 'in-hand',
    signals: [{ name: 'run.cursor', value: thread.activeRunCursor, observedAtMs: nowMs }],
    actions: ['open', 'stop'],
  }
}
