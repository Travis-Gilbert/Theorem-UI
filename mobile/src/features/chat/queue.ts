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

export type QueuedMessage = { id: string; text: string }

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
  /** Sends the authority refused, waiting for the view to give their words back. */
  refused: Refusal[]
}

export const emptyQueue: QueueState = {
  items: [],
  paused: false,
  availability: 'blocked',
  inflight: undefined,
  refused: [],
}

export type QueueEvent =
  | { type: 'availability'; availability: Availability }
  | { type: 'submit'; message: QueuedMessage }
  | { type: 'stopped' }
  /** The send of the in-flight message returned. */
  | { type: 'sent'; id: string }
  /** The authority refused the in-flight message outright. */
  | { type: 'refused'; id: string; error: unknown }
  | { type: 'remove'; id: string }
  /** The view gave a refused message's words back to the person. */
  | { type: 'acknowledge'; id: string }

export type Step = { state: QueueState; dispatch?: QueuedMessage }

/** Hands out the next message when the conversation is free and the queue is not paused. */
function drain(state: QueueState): Step {
  if (state.availability !== 'idle' || state.paused || state.inflight || state.items.length === 0)
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
    case 'stopped':
      return { state: { ...state, paused: true } }
    case 'sent':
      return state.inflight?.id === event.id ? drain({ ...state, inflight: undefined }) : { state }
    case 'refused':
      if (state.inflight?.id !== event.id) return { state }
      return {
        state: {
          ...state,
          inflight: undefined,
          paused: true,
          refused: [...state.refused, { message: state.inflight, error: event.error }],
        },
      }
    case 'remove':
      return { state: { ...state, items: state.items.filter((item) => item.id !== event.id) } }
    case 'acknowledge':
      return { state: { ...state, refused: state.refused.filter((entry) => entry.message.id !== event.id) } }
  }
}
