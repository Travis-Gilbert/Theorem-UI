// SOURCING: Theorem's native composer, ComposerQueue in apps/theoremweb/crates/agent-runtime/src/composer.rs (submit, notify_cancelled, notify_idle, rearm_with, remove), ported as a pure reducer; no React or React Native imports
//
// The SDK has no way to put a message into a run that is already going, so a
// message sent during a run waits here, visible and editable, and goes when the
// conversation can take it. The semantics are the native composer's:
//   - a message sent while a run is going is queued, first in first out;
//   - Stop pauses the queue, and it stays paused until the person sends again;
//   - a queued message keeps one id from the moment it is queued, and that id is
//     the command id of its send, so it can never be sent twice under two ids.
import type { ConversationPhase } from '@theoremharness/sdk'

export type QueuedMessage = {
  id: string
  text: string
  /**
   * The send failed without a definite answer (a lost response, a server
   * error). The words stay here under their original command id, never back in
   * the composer: sending them again under a fresh id could duplicate a message
   * the authority already admitted. See `isDefiniteRefusal` in the SDK.
   */
  uncertain?: boolean
}

/** Whether the conversation can take a message now. `blocked` has no live conversation to send into. */
export type Availability = 'idle' | 'busy' | 'blocked'

const BUSY: ConversationPhase[] = ['running', 'requires-action', 'reconnecting']
const BLOCKED: ConversationPhase[] = ['detached', 'connecting', 'failed', 'authentication-required']

export const availability = (phase: ConversationPhase): Availability =>
  BUSY.includes(phase) ? 'busy' : BLOCKED.includes(phase) ? 'blocked' : 'idle'

export type Refusal = { message: QueuedMessage; error: unknown }

export type QueueState = {
  /** Waiting, in the order they will go. */
  items: QueuedMessage[]
  /** After Stop (or a refused send): nothing goes until the person sends again. */
  paused: boolean
  availability: Availability
  /** A message has been handed to the conversation and its send has not settled yet. */
  inflight: QueuedMessage | undefined
  /**
   * A send was admitted and its run has not settled yet. The published phase
   * can read `ready` for a beat before the run shows in the journal, so the
   * queue stays busy until the run settles rather than draining the next
   * message into a conversation that is still working.
   */
  settling: boolean
  /** Sends the authority refused, waiting for the view to give their words back. */
  refused: Refusal[]
}

export const emptyQueue: QueueState = {
  items: [],
  paused: false,
  availability: 'blocked',
  inflight: undefined,
  settling: false,
  refused: [],
}

export type QueueEvent =
  | { type: 'availability'; availability: Availability }
  | { type: 'submit'; message: QueuedMessage }
  /** Restores messages saved on this device, in order, with the queue's pause. */
  | { type: 'restore'; items: QueuedMessage[]; paused: boolean }
  | { type: 'stopped' }
  /** The send of the in-flight message was admitted; its run may still be going. */
  | { type: 'sent'; id: string }
  /** The run the in-flight send started has settled, so the queue may go on. */
  | { type: 'run-settled' }
  /** The authority refused the in-flight message outright. */
  | { type: 'refused'; id: string; error: unknown }
  /** The send failed without a definite answer; the message keeps its id and waits. */
  | { type: 'uncertain'; id: string; error: unknown }
  | { type: 'remove'; id: string }
  /** The view gave a refused message's words back to the person. */
  | { type: 'acknowledge'; id: string }

export type Step = { state: QueueState; dispatch?: QueuedMessage }

/** Hands out the next message when the conversation is free and the queue is not paused. */
function drain(state: QueueState): Step {
  if (
    state.availability !== 'idle' ||
    state.paused ||
    state.inflight ||
    state.settling ||
    state.items.length === 0
  )
    return { state }
  const [next, ...rest] = state.items
  return { state: { ...state, items: rest, inflight: next }, dispatch: next }
}

export function reduce(state: QueueState, event: QueueEvent): Step {
  switch (event.type) {
    case 'availability':
      if (event.availability === state.availability) return { state }
      return drain({ ...state, availability: event.availability })
    case 'submit':
      // An explicit send re-arms a paused queue and keeps the order of what is waiting.
      return drain({ ...state, paused: false, items: [...state.items, event.message] })
    case 'restore':
      return drain({ ...state, items: [...state.items, ...event.items], paused: event.paused })
    case 'stopped':
      return { state: { ...state, paused: true } }
    case 'sent':
      // The send was admitted, but the run it started may still be going. Stay
      // busy until it settles; a `ready` published here is not the all-clear.
      return state.inflight?.id === event.id
        ? { state: { ...state, inflight: undefined, settling: true } }
        : { state }
    case 'run-settled':
      return state.settling ? drain({ ...state, settling: false }) : { state }
    case 'refused':
      if (state.inflight?.id !== event.id) return { state }
      return {
        state: {
          ...state,
          inflight: undefined,
          settling: false,
          paused: true,
          refused: [...state.refused, { message: state.inflight, error: event.error }],
        },
      }
    case 'uncertain':
      if (state.inflight?.id !== event.id) return { state }
      // No definite answer: keep the words under their original id, at the front
      // of the queue, and pause. They are never handed back to the composer, so
      // they cannot be sent again under a fresh id. A later send retries this id.
      return {
        state: {
          ...state,
          inflight: undefined,
          settling: false,
          paused: true,
          items: [{ ...state.inflight, uncertain: true }, ...state.items],
        },
      }
    case 'remove':
      return { state: { ...state, items: state.items.filter((item) => item.id !== event.id) } }
    case 'acknowledge':
      return { state: { ...state, refused: state.refused.filter((entry) => entry.message.id !== event.id) } }
  }
}
