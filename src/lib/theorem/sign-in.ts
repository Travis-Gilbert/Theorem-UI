// SOURCING: @tanstack/react-start createServerFn (whether sign-in is configured, the ways in and the code sign-in are server state), @tanstack/react-query (cached for the session); the flow itself is src/server/theorem-auth.ts
import { useQuery } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import {
  oauthConfigured,
  pollCodeSignIn as pollCodeSignInOnServer,
  signInOptions as signInOptionsOnServer,
  startCodeSignIn as startCodeSignInOnServer,
} from '@/server/theorem-auth'
import { safeReturnTo } from './auth-navigation'

const signInConfigured = createServerFn({ method: 'GET' }).handler(() =>
  oauthConfigured(),
)

/** Whether people sign in, rather than the UI calling with its own token. */
export function useSignInConfigured() {
  return (
    useQuery({
      queryKey: ['theorem', 'sign-in-configured'],
      queryFn: () => signInConfigured(),
      staleTime: Infinity,
    }).data ?? false
  )
}

/** The ways in Theorem offers, for the sign-in page. */
export const signInOptions = createServerFn({ method: 'GET' }).handler(() =>
  signInOptionsOnServer(),
)

/** The ways in, for a sign-in shown in place of a page that needs one. */
export function useSignInOptions(enabled = true) {
  return useQuery({
    queryKey: ['theorem', 'sign-in-options'],
    queryFn: () => signInOptions(),
    staleTime: Infinity,
    enabled,
  }).data
}

/** Starts a sign-in with a code; undefined when Theorem offers none. */
export const startCodeSignIn = createServerFn({ method: 'POST' })
  .validator((input: { returnTo?: string }) => ({
    returnTo: typeof input.returnTo === 'string' ? input.returnTo : undefined,
  }))
  .handler(({ data }) => startCodeSignInOnServer(data.returnTo))

/** One poll of the sign-in with a code this browser started. */
export const pollCodeSignIn = createServerFn({ method: 'POST' }).handler(() =>
  pollCodeSignInOnServer(),
)

/** Where to send the person to sign in and come back to this page. */
export const signInHref = () =>
  `/login?${new URLSearchParams({ returnTo: safeReturnTo(window.location.pathname + window.location.search) })}`

/**
 * Ends Neon's own session on this origin. Otherwise the next "Continue with
 * email" in this browser signs in as the same account without asking, since
 * Neon skips its login page for a signed-in person. Where email sign-in is not
 * configured this answers 503, which is fine.
 */
export const endNeonSession = () =>
  fetch('/auth/neon/sign-out', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }).then(
    () => undefined,
    () => undefined,
  )

export async function signOut() {
  await Promise.all([
    fetch('/auth/sign-out', { method: 'POST' }),
    endNeonSession(),
  ])
  window.location.assign('/')
}
