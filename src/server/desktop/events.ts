// SOURCING: h3's EventStream (through nitro) frames the server-sent events.
import { defineHandler } from 'nitro'
import { createEventStream } from 'nitro/h3'
import type { ServerRequest } from 'srvx'
import type { HostEvent } from '#/lib/desktop/bindings/HostEvent'
import { onHostEvent } from './control'
import { currentGrants, onGrantsChanged } from './grants'
import { isDesktopMode } from './mode'

/** A comment this often keeps proxies and the web view from idling us out. */
export const KEEPALIVE_MS = 15_000

/**
 * `GET /desktop/host/events`: every `HostEvent` as one SSE `data:` line of
 * JSON. It opens with `grantsChanged` carrying the current grants, since no
 * host call lists them, then sends another whenever they change.
 */
export default defineHandler((event) => {
  if (!isDesktopMode()) return new Response('Not Found', { status: 404 })
  // The stream is meant to idle between events; Bun would close it after 10 s.
  ;(event.req as ServerRequest).runtime?.bun?.server.timeout(event.req, 0)
  const stream = createEventStream(event)
  const send = (hostEvent: HostEvent) => {
    void stream.push(JSON.stringify(hostEvent))
  }
  send({ type: 'grantsChanged', grants: currentGrants() })
  const unsubscribes = [
    onHostEvent(send),
    onGrantsChanged((grants) => send({ type: 'grantsChanged', grants })),
  ]
  const keepalive = setInterval(() => {
    void stream.pushComment('keepalive')
  }, KEEPALIVE_MS)
  stream.onClosed(() => {
    clearInterval(keepalive)
    for (const unsubscribe of unsubscribes) unsubscribe()
  })
  return stream
})
