// SOURCING: @theoremharness/sdk ConversationState (phase, projection.approvals) and the intake Delivery stage. No library models this; the table is the app's own.
//
// What Theo's presence says, and the real event behind it. Every state is read
// from something the phone was given: the conversation's phase, a pending
// approval, the delivery stage, whether the person is composing, and the host
// a task runs on once the computer and inbox screens report one. Nothing here
// is decoration, and nothing claims more than the event does: no state says
// the model read a file, because Theorem does not report that.
import type { ConversationState } from '@theoremharness/sdk'
import type { Delivery } from '../intake/model'
import type { Liveness } from './core'

export type TheoState =
  | 'ready'
  | 'listening'
  | 'reading'
  | 'working'
  | 'waiting-for-host'
  | 'needs-decision'
  | 'recovering'
  | 'done'
  | 'cannot-continue'

/** Which palette role the state's accent takes (docs: purple is identity, gold is ready, active or needs-you). */
export type Accent = 'identity' | 'gold' | 'success' | 'error' | 'quiet'

/** How the accent moves. Reduce Motion turns every one of these into `still`. */
export type Motion = 'still' | 'breathe' | 'pulse'

export type TheoSignals = {
  conversation: Pick<ConversationState, 'phase' | 'projection'>
  /** The person's newest delivery to this conversation, if one is in flight or just ended. */
  delivery?: Pick<Delivery, 'stage'>
  /** True while the composer has focus or a draft: the person is speaking to Theo. */
  composing?: boolean
  /** From the computer screen once it reports one: the host a task runs on, and whether it answers. */
  host?: { reachable: boolean }
  /** Decisions the inbox holds for this conversation, once the inbox reports them. */
  decisionsPending?: number
}

export type TheoPresenceInfo = {
  state: TheoState
  /** Always shown: the state is understood without colour or motion. */
  label: string
  accent: Accent
  motion: Motion
  /** The face's own mood for this state, so a pose and the label never disagree. */
  liveness: Liveness
}

const INFO: Record<TheoState, Omit<TheoPresenceInfo, 'state'>> = {
  ready: { label: 'Ready', accent: 'gold', motion: 'still', liveness: 'idle' },
  listening: { label: 'Listening', accent: 'identity', motion: 'breathe', liveness: 'attend' },
  // The phone is taking the attached files in. It is not a claim that the model has read them.
  reading: { label: 'Taking in attached context', accent: 'identity', motion: 'breathe', liveness: 'attend' },
  working: { label: 'Working', accent: 'gold', motion: 'pulse', liveness: 'work' },
  'waiting-for-host': { label: 'Waiting for a host', accent: 'quiet', motion: 'breathe', liveness: 'work' },
  'needs-decision': { label: 'Needs your decision', accent: 'gold', motion: 'pulse', liveness: 'ask' },
  recovering: { label: 'Trying to recover', accent: 'gold', motion: 'pulse', liveness: 'work' },
  done: { label: 'Done', accent: 'success', motion: 'still', liveness: 'done' },
  'cannot-continue': { label: 'Cannot continue', accent: 'error', motion: 'still', liveness: 'ask' },
}

export const presenceOf = (state: TheoState): TheoPresenceInfo => ({ state, ...INFO[state] })

const approvalsPending = (conversation: TheoSignals['conversation']) =>
  (conversation.projection?.approvals.length ?? 0) > 0

/**
 * The state for what the phone currently knows, or undefined when it knows
 * nothing to say (the conversation is not attached). Order is by what the
 * person most needs to see: a stop, then a decision, then recovery, then the
 * host, then context being taken in, then the work itself.
 */
export function theoStateOf(signals: TheoSignals): TheoState | undefined {
  const { conversation, delivery, composing, host, decisionsPending = 0 } = signals
  const { phase } = conversation
  if (phase === 'detached') return undefined

  if (
    phase === 'failed' ||
    phase === 'authentication-required' ||
    phase === 'cancelled' ||
    phase === 'interrupted' ||
    delivery?.stage === 'refused' ||
    delivery?.stage === 'failed'
  )
    return 'cannot-continue'
  if (phase === 'requires-action' || approvalsPending(conversation) || decisionsPending > 0)
    return 'needs-decision'
  if (phase === 'reconnecting') return 'recovering'
  if (phase === 'connecting' || (host && !host.reachable)) return 'waiting-for-host'
  if (
    delivery &&
    (delivery.stage === 'queued' ||
      delivery.stage === 'uploading' ||
      delivery.stage === 'uploaded' ||
      delivery.stage === 'sending')
  )
    return 'reading'
  if (phase === 'running') return 'working'
  if (composing) return 'listening'
  if (phase === 'completed') return 'done'
  return 'ready'
}
