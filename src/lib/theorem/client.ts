// SOURCING: @theoremharness/sdk (TheoremClient, adopted as-is; same-origin cookie mode behind the server proxy)
import { Theorem, TheoremClient, TheoremError } from '@theoremharness/sdk'

let client: TheoremClient | undefined

/** Browser client. Requests go to this origin; the server route injects the bearer. */
export function theorem(): TheoremClient {
  client ??= new TheoremClient({
    baseUrl: window.location.origin,
    auth: false,
    // Fern's default is 60s; model turns with tools can hold a send longer.
    timeoutInSeconds: 600,
  })
  return client
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
    if (!(error instanceof Theorem.ForbiddenError)) throw error
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

export function describeError(error: unknown): string {
  if (error instanceof TheoremError) {
    const body = error.body as Partial<Theorem.Problem> | undefined
    return body?.detail ?? body?.title ?? error.message
  }
  return error instanceof Error ? error.message : String(error)
}

export { Theorem }
