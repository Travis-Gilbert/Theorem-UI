// SOURCING: Nitro's lazy server routes and H3 cookie helpers, using the same
// OAuth session and streaming proxy as the product's TanStack routes.
import { defineHandler } from 'nitro'
import { getCookie, setCookie } from 'nitro/h3'
import { proxyToTheorem } from './theorem-proxy'

// API reads must not initialize the editor, diagram and syntax-highlighting
// modules in the SSR route tree inside a memory-limited Worker.
export default defineHandler((event) =>
  proxyToTheorem(event.req, {
    read: (name) => getCookie(event, name),
    write: (name, value, options) => setCookie(event, name, value, options),
  }),
)
