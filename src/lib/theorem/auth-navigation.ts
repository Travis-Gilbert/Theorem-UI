// Shared by the login screen and server redirects; URL parsing uses the platform API.
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
      return 'GitHub sign-in was cancelled or access was declined. You can try again.'
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
