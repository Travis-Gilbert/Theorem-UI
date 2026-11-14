// SOURCING: @theoremharness/sdk TheoremClient (bearer supplier; `fetch` is the global expo/fetch Expo installs, which streams response bodies for run events)
import { TheoremClient, type Theorem } from '@theoremharness/sdk'
import { bearer, signOut } from './auth'
import { config } from './config'

export type { Theorem }

let client: TheoremClient | undefined

/** Requests go straight to the authority with the person's bearer. */
export function theorem(): TheoremClient {
  client ??= new TheoremClient({
    baseUrl: config.authority,
    token: async () => {
      const token = await bearer()
      if (!token) throw new Error('Sign in to Theorem first.')
      return token
    },
    fetch: async (input, init) => {
      const response = await fetch(input, init)
      // The authority no longer accepts this bearer: the session is over.
      if (response.status === 401) void signOut('Your Theorem session ended. Sign in again.')
      return response
    },
    // Model turns with tools can hold a send for minutes.
    timeoutInSeconds: 600,
  })
  return client
}

export type MutationHeaders = { 'X-CSRF-Token': string; 'Idempotency-Key': string }

/**
 * One mutation outside a conversation journal (creating a thread, answering an
 * approval). The key is the caller's, so pressing again after a lost response
 * repeats the same request rather than making a second one.
 */
export async function mutate<T>(key: string, run: (headers: MutationHeaders) => Promise<T>): Promise<T> {
  const session = await theorem().session.bootstrap()
  return run({ 'X-CSRF-Token': session.csrfToken, 'Idempotency-Key': key })
}

export { describeError, statusOf } from './errors'
