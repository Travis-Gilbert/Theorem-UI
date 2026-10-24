// SOURCING: json-rpc-2.0 serves the JSON-RPC envelope (ids, batches, error
// codes); zod (./protocol) checks the params before they reach the host.
import {
  JSONRPCErrorCode,
  JSONRPCErrorException,
  JSONRPCServer,
} from 'json-rpc-2.0'
import { defineHandler } from 'nitro'
import type { ServerRequest } from 'srvx'
import { z } from 'zod'
import { callHost } from './control'
import { desktopOrigin, isDesktopMode } from './mode'
import { HOST_CALL_METHODS, hostCallSchema } from './protocol'

/** How long the host gets to answer anything but `pickFolder`. */
export const CALL_TIMEOUT_MS = 60_000

const rpc = new JSONRPCServer({
  // An error the host or the params check reports is the caller's answer, not
  // a server fault worth logging.
  errorListener: (message, error) => {
    if (!(error instanceof JSONRPCErrorException)) console.error(message, error)
  },
})

for (const method of HOST_CALL_METHODS) {
  rpc.addMethod(method, (params) => {
    const call = hostCallSchema.safeParse({ method, params: params ?? {} })
    if (!call.success) {
      throw new JSONRPCErrorException(
        z.prettifyError(call.error),
        JSONRPCErrorCode.InvalidParams,
      )
    }
    // pickFolder waits on the person at a native dialog, for as long as they take.
    return callHost(
      call.data,
      method === 'pickFolder' ? undefined : CALL_TIMEOUT_MS,
    )
  })
}

/**
 * `POST /desktop/host/rpc`: one JSON-RPC 2.0 request (or batch) naming a
 * `HostCall` method, relayed to the host over the control channel. The guard
 * has already checked `Host` and the session cookie.
 */
export default defineHandler(async (event) => {
  if (!isDesktopMode()) return new Response('Not Found', { status: 404 })
  // Only the app's own pages may call: a cross-origin or sandboxed (`null`)
  // origin is refused even if it somehow holds the cookie.
  if (event.req.headers.get('origin') !== desktopOrigin()) {
    return new Response('Forbidden', { status: 403 })
  }
  if (!event.req.headers.get('content-type')?.startsWith('application/json')) {
    return new Response('Unsupported Media Type', { status: 415 })
  }
  // Bun closes a connection idle for 10 seconds; a folder picker can stay open
  // far longer. The timeouts in callHost bound the wait instead.
  ;(event.req as ServerRequest).runtime?.bun?.server.timeout(event.req, 0)
  const reply = await rpc.receiveJSON(await event.req.text())
  // A notification (no id) has no reply.
  return reply === null
    ? new Response(null, { status: 204 })
    : Response.json(reply)
})
