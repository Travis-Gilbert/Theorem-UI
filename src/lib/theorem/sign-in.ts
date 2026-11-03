// SOURCING: @tanstack/react-start createServerFn (whether sign-in is configured is server configuration), @tanstack/react-query (cached for the session); the flow itself is src/server/theorem-auth.ts
import { useQuery } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { oauthConfigured } from '@/server/theorem-auth'
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

/** Where to send the person to sign in and come back to this page. */
export const signInHref = () =>
  `/login?${new URLSearchParams({ returnTo: safeReturnTo(window.location.pathname + window.location.search) })}`

export async function signOut() {
  await fetch('/auth/sign-out', { method: 'POST' })
  window.location.assign('/')
}
