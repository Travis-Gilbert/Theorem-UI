// Shared by the login screen and server redirects; URL parsing uses the platform API.

/**
 * For the pages Neon sends a person to while signing in. They take a password
 * or an approval, so no other site may frame them; their address carries a
 * signed authorization query, so it is not sent to other origins. Same-origin,
 * not no-referrer: a no-referrer page sends `Origin: null` on its POSTs, which
 * Neon would refuse.
 */
export const authPageHeaders = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Cache-Control': 'no-store',
}
export function safeReturnTo(value: string | null | undefined) {
  const origin = 'https://theorem.invalid'
  if (!value?.startsWith('/') || value.startsWith('//')) return '/'
  let url: URL
  try {
    url = new URL(value, origin)
  } catch {
    return '/'
  }
  if (
    url.origin !== origin ||
    url.pathname.startsWith('/auth/') ||
    url.pathname === '/login'
  )
    return '/'
  url.searchParams.delete('signin_error')
  return url.pathname + url.search + url.hash
}

export function loginFailureHref(code: string, returnTo = '/') {
  return `/login?${new URLSearchParams({ signin_error: code, returnTo: safeReturnTo(returnTo) })}`
}

export function signInFailureMessage(code: string) {
  switch (code) {
    case 'expired':
      return 'Your sign-in session is missing or expired. Start again in the same browser, with cookies enabled.'
    case 'access_denied':
      return 'Sign-in was cancelled, or that account is not admitted to this Theorem. You can try again, or sign in another way.'
    case 'invalid_grant':
      return 'The sign-in code expired or was already used. Start a new sign-in instead of reloading the callback.'
    case 'invalid_client':
    case 'unauthorized_client':
    case 'invalid_scope':
    case 'configuration':
      return 'Theorem’s sign-in configuration needs attention. Retrying will not fix this until the service is updated.'
    case 'state_mismatch':
      return 'This response does not match the sign-in you started. Close other sign-in tabs and try again here.'
    case 'unavailable':
      return 'The sign-in service could not be reached. Please try again.'
    default:
      return 'Sign-in could not be completed. Start again in this browser.'
  }
}
