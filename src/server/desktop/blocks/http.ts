// SOURCING: zod (request bodies) and the platform Request/Response and
// ReadableStream APIs, through the workspace routes' route() wrapper. The
// state event stream is Server-Sent Events framed by hand, as the workspace
// event stream is.
import path from 'node:path'
import type { ServerRequest } from 'srvx'
import { z } from 'zod'
import { DESKTOP_HOSTNAME, desktopListen } from '../mode'
import { WorkspaceError } from '../workspace/errors'
import { query, route } from '../workspace/http'
import type { Handler, Params } from '../workspace/http'
import { getWorkspace, workspaceDataDir } from '../workspace/registry'
import type { WorkspaceService } from '../workspace/service'
import { closeStateDocument, stateDocument } from './state-document'
import type { StateDocument } from './state-document'
import { BlockStore } from './store'
import { issueAppToken } from './tokens'

/** The block listener's origin, which block frames load from. */
export const blockOrigin = () =>
  `http://${DESKTOP_HOSTNAME}:${desktopListen().blockPort}`

const workspace = (params: Params) => getWorkspace(params.workspaceId ?? '')
const storeOf = (service: WorkspaceService) =>
  new BlockStore(workspaceDataDir(service.id))

const following = new WeakSet<WorkspaceService>()

/** The workspace's state document, saved and closed when the workspace closes. */
async function stateOf(service: WorkspaceService): Promise<StateDocument> {
  if (!following.has(service)) {
    following.add(service)
    service.onClose(() => void closeStateDocument(service.id))
  }
  return stateDocument(service.id, workspaceDataDir(service.id))
}

function requireTrust(service: WorkspaceService) {
  if (!service.summary().trusted)
    throw new WorkspaceError(
      403,
      'workspace_untrusted',
      `${service.name} is not trusted, so its blocks do not run`,
    )
}

const capabilities = z.object({
  read: z.array(z.string()),
  write: z.array(z.string()),
  state: z.array(z.string()),
  net: z.array(z.string()),
  run: z.array(z.string()),
})

const compiledBody = z.object({
  key: z.string(),
  sourceHash: z.string(),
  code: z.string(),
  inputs: z.array(z.string()),
  builtins: z.array(z.string()),
  outputs: z.array(z.string()),
  autodisplay: z.boolean(),
  capabilities,
  declarationErrors: z.array(z.string()),
})

const lastRunBody = z.object({
  sourceHash: z.string(),
  ranAt: z.string(),
  durationMs: z.number(),
  status: z.enum(['ok', 'error']),
  error: z.object({ message: z.string(), name: z.string() }).optional(),
  value: z.string().optional(),
  lines: z.array(z.object({ line: z.number().int(), text: z.string() })),
})

const appTokenBody = z.object({
  workspaceId: z.string(),
  /** An `.html` file, or a folder holding `index.html`. */
  path: z.string(),
})

function stateEvents(request: Request, document: StateDocument): Response {
  // Bun ends idle requests after ten seconds; an event stream is idle by design.
  ;(request as ServerRequest).runtime?.bun?.server.timeout(request, 0)
  const encoder = new TextEncoder()
  let stop = () => {}
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          stop()
        }
      }
      const unsubscribe = document.subscribe((update) =>
        send(`data: ${Buffer.from(update).toString('base64')}\n\n`),
      )
      const heartbeat = setInterval(() => send(': ping\n\n'), 15_000)
      const end = () => {
        stop()
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      }
      request.signal.addEventListener('abort', end)
      stop = () => {
        unsubscribe()
        clearInterval(heartbeat)
        request.signal.removeEventListener('abort', end)
      }
      send('retry: 1000\n: connected\n\n')
    },
    cancel: () => stop(),
  })
  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}

/** Handlers for the live block routes, by route file. */
export const blockRoutes = {
  index: {
    GET: route(() => Response.json({ origin: blockOrigin() })),
  },
  appToken: {
    POST: route(async ({ request }) => {
      const body = appTokenBody.parse(await request.json())
      const service = await getWorkspace(body.workspaceId)
      requireTrust(service)
      const file = body.path.replace(/\/+$/, '')
      const isHtml = /\.html?$/i.test(file)
      const root = isHtml ? path.posix.dirname(file) : file
      const entry = isHtml ? path.posix.basename(file) : 'index.html'
      const token = issueAppToken(service.id, root === '.' ? '' : root)
      return Response.json({
        url: `${blockOrigin()}/app/${token}/${encodeURIComponent(entry)}`,
      })
    }),
  },
  state: {
    GET: route(async ({ params }) => {
      const document = await stateOf(await workspace(params))
      return new Response(document.snapshot() as Uint8Array<ArrayBuffer>, {
        headers: {
          'content-type': 'application/octet-stream',
          'cache-control': 'no-store',
        },
      })
    }),
    POST: route(async ({ request, params }) => {
      const document = await stateOf(await workspace(params))
      document.apply(new Uint8Array(await request.arrayBuffer()))
      return new Response(null, { status: 204 })
    }),
  },
  stateEvents: {
    GET: route(async ({ request, params }) =>
      stateEvents(request, await stateOf(await workspace(params))),
    ),
  },
  lastRun: {
    GET: route(async ({ request, params }) => {
      const run = await storeOf(await workspace(params)).readLastRun(
        query(request, 'hash'),
      )
      if (!run)
        throw new WorkspaceError(404, 'not_found', 'This source has not run')
      return Response.json(run)
    }),
    PUT: route(async ({ request, params }) => {
      const hash = query(request, 'hash')
      const run = lastRunBody.parse(await request.json())
      if (run.sourceHash !== hash)
        throw new WorkspaceError(400, 'invalid_body', 'sourceHash ≠ hash')
      await storeOf(await workspace(params)).writeLastRun(hash, run)
      return new Response(null, { status: 204 })
    }),
  },
  compiled: {
    GET: route(async ({ request, params }) => {
      const cell = await storeOf(await workspace(params)).readCompiled(
        query(request, 'key'),
      )
      if (!cell) throw new WorkspaceError(404, 'not_found', 'Not compiled yet')
      return Response.json(cell)
    }),
    PUT: route(async ({ request, params }) => {
      const service = await workspace(params)
      requireTrust(service)
      const cell = compiledBody.parse(await request.json())
      if (cell.key !== query(request, 'key'))
        throw new WorkspaceError(400, 'invalid_body', 'key ≠ the compile key')
      await storeOf(service).writeCompiled(cell)
      return new Response(null, { status: 204 })
    }),
  },
} satisfies Record<string, Partial<Record<string, Handler>>>
