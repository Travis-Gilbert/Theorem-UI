// SOURCING: @theoremharness/sdk ConversationState phases and the error it carries (TheoremError.statusCode, ConversationProtocolError); no React or React Native imports, so the mapping is testable on its own
//
// What the person is told when a conversation cannot be reached, and the one
// action that could fix it. A button is offered only when pressing it can
// resolve the condition: Reconnect for a connection that dropped, Sign in again
// for a session that ended, and nothing for a server this app cannot talk to,
// because trying again against the same server fails the same way.
import { ConversationProtocolError, type ConversationState } from '@theoremharness/sdk'

export type FailureKind = 'disconnected' | 'signed-out' | 'incompatible'

export type Recovery = 'reconnect' | 'sign-in'

export type Notice = {
  /** Stable per condition, so a notice the person is reading is not replaced by an identical one. */
  id: string
  tone: 'muted' | 'attention' | 'error'
  text: string
  /** Technical text behind the Details disclosure; never in the line itself. */
  details?: string
  action?: { recovery: Recovery; label: string }
}

/** Statuses that say the server does not speak what this app speaks. Retrying cannot change them. */
const INCOMPATIBLE_STATUS = new Set([400, 405, 410, 422, 426, 501, 505])

const statusOf = (error: unknown): number | undefined => {
  const status = (error as { statusCode?: unknown } | null)?.statusCode
  return typeof status === 'number' ? status : undefined
}

/**
 * The SDK's protocol errors are bare `class extends Error`, and on the phone's
 * JavaScript engine `instanceof` does not hold for them (seen live: the
 * bootstrap identity error arrived as a plain Error). Their messages are fixed
 * strings in the SDK, so those are matched too.
 */
const PROTOCOL_MESSAGE =
  /^(Bootstrap did not provide|Run sequence |Thread revision |terminal conversation projection)/
const protocolError = (error: unknown) =>
  error instanceof ConversationProtocolError ||
  (error instanceof Error && PROTOCOL_MESSAGE.test(error.message))

/** A reply the app could not read because a field it needs was not there. */
const unreadableReply = (error: unknown) =>
  error instanceof TypeError ||
  (error instanceof Error &&
    /\b(missing|required|undefined|unexpected|schema|invalid)\b.*\b(field|property|token|response|reply|bootstrap)\b|\bbootstrap\b.*\b(missing|required)\b/i.test(
      error.message,
    ))

/**
 * Why a conversation that is not live cannot be used, from the phase and the
 * error the SDK attached. `undefined` for a phase that is not a connection
 * problem.
 */
export function failureKind(state: Pick<ConversationState, 'phase' | 'error'>): FailureKind | undefined {
  const { phase, error } = state
  const status = statusOf(error)
  if (phase === 'authentication-required' || status === 401 || status === 403) return 'signed-out'
  if (phase !== 'failed' && phase !== 'detached' && phase !== 'reconnecting') return undefined
  if (protocolError(error)) return 'incompatible'
  if (status !== undefined && INCOMPATIBLE_STATUS.has(status)) return 'incompatible'
  if (status === undefined && error && unreadableReply(error)) return 'incompatible'
  return 'disconnected'
}

/** The line shown for a conversation phase, or nothing when the phase needs no line. */
export function connectionNotice(
  state: Pick<ConversationState, 'phase' | 'error'>,
  describe: (error: unknown) => string,
): Notice | undefined {
  const { phase, error } = state
  const details = error === undefined ? undefined : describe(error)
  switch (phase) {
    case 'connecting':
      return { id: 'connecting', tone: 'muted', text: 'Connecting to Theorem…' }
    case 'requires-action':
      return { id: 'requires-action', tone: 'attention', text: 'Theorem is waiting on you. Answer the request above.' }
    case 'cancelled':
      return { id: 'cancelled', tone: 'muted', text: 'Run stopped.' }
    case 'interrupted':
      return { id: 'interrupted', tone: 'error', text: 'The run was interrupted.', details }
    case 'detached':
    case 'failed':
    case 'reconnecting':
    case 'authentication-required':
      break
    default:
      return undefined
  }
  switch (failureKind(state)) {
    case 'signed-out':
      return {
        id: 'signed-out',
        tone: 'error',
        text: 'Your session ended. Sign in again to continue.',
        details,
        action: { recovery: 'sign-in', label: 'Sign in again' },
      }
    case 'incompatible':
      return {
        id: 'incompatible',
        tone: 'error',
        text: "This version of Theorem can't talk to this server.",
        details: ['The server needs updating before this app can use it.', details].filter(Boolean).join('\n'),
      }
    default:
      return {
        id: phase === 'reconnecting' ? 'reconnecting' : 'disconnected',
        tone: phase === 'reconnecting' ? 'attention' : 'error',
        text:
          phase === 'reconnecting'
            ? 'Reconnecting. The run continues on Theorem.'
            : "Can't connect to Theorem. Your draft is saved.",
        details,
        action: { recovery: 'reconnect', label: 'Reconnect' },
      }
  }
}
