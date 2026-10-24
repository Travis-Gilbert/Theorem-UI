// SOURCING: nitro (h3's defineMiddleware). The checks are plan D4's own; no
// library models a single web view's loopback session.
import { defineMiddleware } from 'nitro'
import { desktopHostHeader } from './mode'
import { SESSION_PATH, hasSession } from './session'

/**
 * Admits only the app's own web view: a `Host` header of exactly
 * `127.0.0.1:<port>`, which shuts out DNS rebinding, and this launch's session
 * cookie, which shuts out other local processes and pages in other browsers.
 * `/desktop/session` needs only the `Host`, since the cookie comes from there.
 *
 * The desktop plugin puts this in front of Nitro's static-asset middleware, so
 * it covers app pages, server routes and `.output/public` alike.
 */
export const desktopGuard = defineMiddleware((event, next) => {
  if (
    event.req.headers.get('host') !== desktopHostHeader() ||
    (event.url.pathname !== SESSION_PATH && !hasSession(event))
  ) {
    return new Response('Forbidden', { status: 403 })
  }
  return next()
})
