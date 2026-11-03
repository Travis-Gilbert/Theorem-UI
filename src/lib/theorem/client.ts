// SOURCING: @theoremharness/sdk (TheoremClient, adopted as-is; same-origin cookie mode behind the server proxy)
import { Theorem, TheoremClient, TheoremError } from '@theoremharness/sdk'
import { createSendRecovery } from './send-recovery'

let client: TheoremClient | undefined
let sendRecovery: ReturnType<typeof createSendRecovery> | undefined

/** Browser client. Requests go to this origin; the server route injects the bearer. */
export function theorem(): TheoremClient {
  sendRecovery ??= createSendRecovery(
    window.sessionStorage,
    window.fetch.bind(window),
  )
  client ??= new TheoremClient({
    fetch: sendRecovery.fetch,
    baseUrl: window.location.origin,
    auth: false,
    // Fern's default is 60s; model turns with tools can hold a send longer.
    timeoutInSeconds: 600,
  })
  return client
}

/** Recover the exact saved send before the SDK's pending-turn guard runs. */
export async function recoverPendingSend(
  threadId: string,
  text?: string,
  abortSignal?: AbortSignal,
) {
  theorem()
  if (!sendRecovery?.has(threadId)) return undefined
  const session = await theorem().session.bootstrap({ abortSignal })
  return sendRecovery.resume(
    threadId,
    window.location.origin,
    session.csrfToken,
    text,
    abortSignal,
  )
}

/** Only public event descriptions reach the UI; raw diagnostics stay server-side. */
export function describeRunFailure(payload: Record<string, unknown>): string {
  const message =
    typeof payload.message === 'string' && payload.message.trim()
      ? payload.message.trim()
      : 'The response was interrupted. Reload the conversation to check its saved history.'
  const reference = payload.correlation_id ?? payload.correlationId
  return typeof reference === 'string' && reference
    ? `${message} Reference: ${reference}`
    : message
}

let bootstrapPromise: Promise<Theorem.Bootstrap> | undefined

/** Session bootstrap carries the CSRF token. It lives in server memory, so refresh on 403. */
export function bootstrap(force = false): Promise<Theorem.Bootstrap> {
  if (force || !bootstrapPromise) {
    bootstrapPromise = theorem()
      .session.bootstrap()
      .catch((error: unknown) => {
        bootstrapPromise = undefined
        throw error
      })
  }
  return bootstrapPromise
}

export type MutationHeaders = {
  'X-CSRF-Token': string
  'Idempotency-Key': string
}

/** Runs one mutation with fresh CSRF and a stable idempotency key, re-bootstrapping once on 403. */
export async function mutate<T>(
  run: (headers: MutationHeaders) => Promise<T>,
): Promise<T> {
  const key = crypto.randomUUID()
  const session = await bootstrap()
  try {
    return await run({
      'X-CSRF-Token': session.csrfToken,
      'Idempotency-Key': key,
    })
  } catch (error) {
    // Each API (chat, documents, spaces) has its own error classes; match the status.
    if (!hasStatus(error, 403)) throw error
    const fresh = await bootstrap(true)
    return run({ 'X-CSRF-Token': fresh.csrfToken, 'Idempotency-Key': key })
  }
}

/** Revisioned thread mutation: read the current revision, retry once on a stale If-Match. */
export async function mutateThread<T>(
  threadId: string,
  run: (headers: MutationHeaders & { 'If-Match': string }) => Promise<T>,
): Promise<T> {
  const attempt = async () => {
    const { thread } = await theorem().chat.threads.get({ threadId })
    return mutate((headers) =>
      run({ ...headers, 'If-Match': String(thread.revision) }),
    )
  }
  try {
    return await attempt()
  } catch (error) {
    if (
      error instanceof Theorem.ConflictError ||
      error instanceof Theorem.PreconditionError
    )
      return attempt()
    throw error
  }
}

/** The proxy answers 401 when nobody is signed in or the session has lapsed. */
export const isSignedOut = (error: unknown) =>
  error instanceof TheoremError && error.statusCode === 401

export function hasStatus(error: unknown, ...codes: number[]): boolean {
  return (
    error instanceof TheoremError &&
    error.statusCode !== undefined &&
    codes.includes(error.statusCode)
  )
}

export function describeError(error: unknown): string {
  if (error instanceof TheoremError) {
    const body =
      error.body && typeof error.body === 'object'
        ? (error.body as Record<string, unknown>)
        : undefined
    const text = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : undefined
    const detail = text(body?.detail)
    let message = detail ?? text(body?.title)
    if (body?.code === 'chat_run_start_pending') {
      message =
        'Your message was saved, but its response could not start. Reload this conversation to resume it.'
      if (detail) message += ` ${detail}`
    }
    if (!message) {
      switch (error.statusCode) {
        case 401:
          message = 'Sign in to continue.'
          break
        case 403:
          message = 'You do not have permission to perform this action.'
          break
        case 413:
          message = 'The message or attachment is too large.'
          break
        case 429:
          message = 'Too many requests. Try again shortly.'
          break
        case 502:
        case 503:
        case 504:
          message = 'The chat service is unavailable. Try again shortly.'
          break
        default:
          message = error.statusCode
            ? `The request could not be completed (HTTP ${error.statusCode}).`
            : 'The chat service could not be reached. Check your connection.'
      }
    }
    const reference = text(body?.correlationId)
    return reference ? `${message} Reference: ${reference}` : message
  }
  return error instanceof Error ? error.message : String(error)
}

export { Theorem }
