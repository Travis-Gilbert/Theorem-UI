// SOURCING: node:crypto for the session token and the constant-time
// comparison; h3 (through nitro) for the query, the cookie and the redirect.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { defineHandler } from 'nitro'
import { getCookie, getQuery, redirect, setCookie } from 'nitro/h3'
import type { H3Event } from 'nitro/h3'
import { isDesktopMode } from './mode'

export const SESSION_PATH = '/desktop/session'
export const SESSION_COOKIE = 'theorem_session'

let launchSecret: string | undefined
let sessionToken: string | undefined

/** Keeps the host's one-time launch secret until the web view exchanges it. */
export function setLaunchSecret(secret: string): void {
  launchSecret = secret
}

/** True when the request carries this launch's session cookie. */
export function hasSession(event: H3Event): boolean {
  const cookie = getCookie(event, SESSION_COOKIE)
  return (
    sessionToken !== undefined &&
    cookie !== undefined &&
    sameSecret(cookie, sessionToken)
  )
}

/**
 * `GET /desktop/session?secret=…`: swaps the launch secret, once, for a fresh
 * session token in an HttpOnly, SameSite=Strict cookie, and sends the web view
 * on to the app.
 */
export default defineHandler((event) => {
  if (!isDesktopMode()) return new Response('Not Found', { status: 404 })
  const { secret } = getQuery(event)
  if (
    launchSecret === undefined ||
    typeof secret !== 'string' ||
    !sameSecret(secret, launchSecret)
  ) {
    return new Response('Forbidden', { status: 403 })
  }
  launchSecret = undefined
  sessionToken = randomBytes(32).toString('base64url')
  // Plain http on loopback, so no Secure attribute.
  setCookie(event, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
  })
  return redirect('/')
})

/** Compares in constant time; hashing first gives both sides one length. */
function sameSecret(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(a), digest(b))
}
