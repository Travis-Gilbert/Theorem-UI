// STAND-IN, development only (see workspace-stand-in.ts). Mounts the stand-in product server on
// the Vite dev and preview servers, configured from the environment:
//
//   THEOREM_IDE_HOST_URL         default http://127.0.0.1:8791
//   THEOREM_IDE_HOST_TENANT      required: the tenant the host was started with
//   THEOREM_IDE_HOST_ACTOR       default stand-in:dev: the caller, whose per-user state the page sees
//   THEOREM_IDE_HOST_TOKEN_FILE  required: a file holding the host's bearer token
//
// With the tenant or token missing, the plugin does nothing and the page shows its own "could not
// open the workspace" screen rather than a half-working proxy.

import { readFileSync } from 'node:fs'
import { pipeline, Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { createStandIn } from './workspace-stand-in'

type Next = (error?: unknown) => void

function toRequest(req: IncomingMessage, res: ServerResponse): Request {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(name, v)
    else if (value !== undefined) headers.set(name, value)
  }
  // The client going away is the RESPONSE closing before it finished. A request's own `close` fires
  // as soon as its body has been read, which for a GET is at once.
  const aborted = new AbortController()
  res.on('close', () => {
    if (!res.writableFinished) aborted.abort()
  })
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  return new Request(new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`), {
    method: req.method,
    headers,
    signal: aborted.signal,
    ...(hasBody ? { body: Readable.toWeb(req) as unknown as ReadableStream, duplex: 'half' } : {}),
  } as RequestInit)
}

async function respond(res: ServerResponse, reply: Response): Promise<void> {
  res.statusCode = reply.status
  reply.headers.forEach((value, name) => res.setHeader(name, value))
  if (!reply.body) return void res.end()
  res.flushHeaders()
  // A host that dies mid-stream errors the body; `pipeline` ends the response with it instead of
  // leaving an unhandled error that would take the dev server down.
  const body = Readable.fromWeb(reply.body as never)
  res.on('close', () => body.destroy())
  pipeline(body, res, () => {})
}

export function workspaceStandIn(): Plugin {
  const hostUrl = process.env.THEOREM_IDE_HOST_URL ?? 'http://127.0.0.1:8791'
  const tenant = process.env.THEOREM_IDE_HOST_TENANT
  const actor = process.env.THEOREM_IDE_HOST_ACTOR ?? 'stand-in:dev'
  const tokenFile = process.env.THEOREM_IDE_HOST_TOKEN_FILE
  const middleware = (): ((req: IncomingMessage, res: ServerResponse, next: Next) => void) | undefined => {
    if (!tenant || !tokenFile) return undefined
    const handle = createStandIn({ hostUrl, tenant, actor, token: readFileSync(tokenFile, 'utf8').trim() })
    return (req, res, next) => {
      handle(toRequest(req, res))
        .then((reply) => (reply ? respond(res, reply) : next()))
        .catch((error: unknown) => {
          if (res.headersSent) return void res.destroy()
          res.statusCode = 502
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ code: 'host_unreachable', message: error instanceof Error ? error.message : String(error) }))
        })
    }
  }
  return {
    name: 'theorem-ide-cm:workspace-stand-in',
    configureServer(server) {
      const use = middleware()
      if (use) server.middlewares.use(use)
    },
    configurePreviewServer(server) {
      const use = middleware()
      if (use) server.middlewares.use(use)
    },
  }
}
