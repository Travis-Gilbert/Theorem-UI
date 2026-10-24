// SOURCING: zod (request bodies), Bun.file().type (content types by
// extension) and the platform Request/Response/ReadableStream APIs. The event
// stream follows theorem-proxy.ts: Server-Sent Events framing written by hand,
// a few lines, with Bun's idle timeout lifted for the request.
import type { ServerRequest } from 'srvx'
import { z } from 'zod'
import type { WorkspaceEvent } from '#/lib/workspace/types'
import { isDesktopMode } from '../mode'
import { WorkspaceError } from './errors'
import { getWorkspace, listWorkspaces } from './registry'
import type { WorkspaceService } from './service'

export type Params = Record<string, string | undefined>
type Context = { request: Request; params: Params }
export type Handler = (context: Context) => Promise<Response> | Response

function problem(
  status: number,
  code: string,
  detail: string,
  extra: Record<string, unknown> = {},
): Response {
  return Response.json(
    {
      type: 'about:blank',
      title: code.replaceAll('_', ' '),
      status,
      code,
      correlationId: crypto.randomUUID(),
      detail,
      ...extra,
    },
    { status, headers: { 'content-type': 'application/problem+json' } },
  )
}

function toProblem(error: unknown): Response {
  if (error instanceof WorkspaceError)
    return problem(error.status, error.code, error.message, error.extra)
  if (error instanceof z.ZodError)
    return problem(400, 'invalid_body', z.prettifyError(error))
  if (error instanceof SyntaxError)
    return problem(400, 'invalid_body', 'The body is not valid JSON')
  console.error('[workspace] request failed', error)
  return problem(500, 'internal_error', 'The workspace service failed')
}

/**
 * Wraps a workspace route handler: 404 unless the desktop host started this
 * server, and errors answered as problem+json.
 */
export function route(handler: Handler): Handler {
  return async (context) => {
    if (!isDesktopMode()) return new Response('Not Found', { status: 404 })
    try {
      return await handler(context)
    } catch (error) {
      return toProblem(error)
    }
  }
}

export function query(request: Request, name: string): string {
  const value = new URL(request.url).searchParams.get(name)
  if (value === null)
    throw new WorkspaceError(400, 'missing_parameter', `${name} is required`)
  return value
}

const etag = (hash: string) => `"${hash}"`

/** The hash in an `If-Match` or `If-None-Match` value such as `"abc"` or `W/"abc"`. */
const hashOf = (value: string) =>
  value.trim().replace(/^W\//, '').replace(/^"|"$/g, '')

/**
 * The write precondition from the request: `If-Match: "<hash>"` for a file
 * that must still have that hash, `If-None-Match: *` for one that must not
 * exist yet, or none.
 */
function precondition(request: Request): string | null | undefined {
  const ifMatch = request.headers.get('if-match')
  if (ifMatch) return hashOf(ifMatch)
  if (request.headers.get('if-none-match')?.trim() === '*') return null
  return undefined
}

const workspace = (params: Params) => getWorkspace(params.workspaceId ?? '')

const pathBody = z.object({ path: z.string() })
const renameBody = z.object({ from: z.string(), to: z.string() })
const trustBody = z.object({ trusted: z.boolean() })

function eventStream(request: Request, service: WorkspaceService): Response {
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
      const end = () => {
        stop()
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      }
      const unsubscribe = service.subscribe((event: WorkspaceEvent) =>
        send(`data: ${JSON.stringify(event)}\n\n`),
      )
      const unclose = service.onClose(end)
      const heartbeat = setInterval(() => send(': ping\n\n'), 15_000)
      request.signal.addEventListener('abort', end)
      stop = () => {
        unsubscribe()
        unclose()
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

/** Handlers for each workspace route, by route file. */
export const workspaceRoutes = {
  list: {
    GET: route(async () => Response.json(await listWorkspaces())),
  },
  summary: {
    GET: route(async ({ params }) =>
      Response.json((await workspace(params)).summary()),
    ),
  },
  tree: {
    GET: route(async ({ params }) =>
      Response.json((await workspace(params)).tree()),
    ),
  },
  file: {
    GET: route(async ({ request, params }) => {
      const service = await workspace(params)
      const filePath = query(request, 'path')
      const { bytes, hash } = await service.read(filePath)
      const headers = {
        etag: etag(hash),
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
      }
      const ifNoneMatch = request.headers.get('if-none-match')
      if (ifNoneMatch && hashOf(ifNoneMatch) === hash)
        return new Response(null, { status: 304, headers })
      // node:fs reads into an ArrayBuffer, never a SharedArrayBuffer.
      return new Response(bytes as Uint8Array<ArrayBuffer>, {
        headers: {
          ...headers,
          'content-type': Bun.file(filePath).type,
        },
      })
    }),
    PUT: route(async ({ request, params }) => {
      const service = await workspace(params)
      const expected = precondition(request)
      const { hash } = await service.write(
        query(request, 'path'),
        new Uint8Array(await request.arrayBuffer()),
        expected,
      )
      return Response.json({ hash }, { headers: { etag: etag(hash) } })
    }),
    DELETE: route(async ({ request, params }) => {
      await (await workspace(params)).remove(query(request, 'path'))
      return new Response(null, { status: 204 })
    }),
  },
  mkdir: {
    POST: route(async ({ request, params }) => {
      const service = await workspace(params)
      const { path } = pathBody.parse(await request.json())
      await service.mkdir(path)
      return new Response(null, { status: 201 })
    }),
  },
  rename: {
    POST: route(async ({ request, params }) => {
      const service = await workspace(params)
      const { from, to } = renameBody.parse(await request.json())
      await service.rename(from, to)
      return new Response(null, { status: 204 })
    }),
  },
  resolve: {
    GET: route(async ({ request, params }) => {
      const service = await workspace(params)
      const syntax =
        new URL(request.url).searchParams.get('syntax') === 'markdown'
          ? 'markdown'
          : 'wiki'
      return Response.json({
        resolved: service.resolve(
          query(request, 'target'),
          query(request, 'from'),
          syntax,
        ),
      })
    }),
  },
  links: {
    GET: route(async ({ request, params }) =>
      Response.json((await workspace(params)).links(query(request, 'path'))),
    ),
  },
  backlinks: {
    GET: route(async ({ request, params }) =>
      Response.json(
        (await workspace(params)).backlinks(query(request, 'path')),
      ),
    ),
  },
  search: {
    GET: route(async ({ request, params }) => {
      const service = await workspace(params)
      const limit = Number(new URL(request.url).searchParams.get('limit') ?? 20)
      return Response.json(
        service.search(
          query(request, 'q'),
          Number.isFinite(limit) ? limit : 20,
        ),
      )
    }),
  },
  tags: {
    GET: route(async ({ params }) =>
      Response.json((await workspace(params)).tags()),
    ),
  },
  properties: {
    GET: route(async ({ request, params }) =>
      Response.json(
        (await workspace(params)).properties(query(request, 'path')),
      ),
    ),
  },
  settings: {
    GET: route(async ({ params }) =>
      Response.json(await (await workspace(params)).folderSettings()),
    ),
    PUT: route(async ({ request, params }) => {
      const service = await workspace(params)
      return Response.json(
        await service.setFolderSettings(await request.json()),
      )
    }),
  },
  trust: {
    PUT: route(async ({ request, params }) => {
      const service = await workspace(params)
      const { trusted } = trustBody.parse(await request.json())
      await service.setTrusted(trusted)
      return Response.json(service.summary())
    }),
  },
  events: {
    GET: route(async ({ request, params }) =>
      eventStream(request, await workspace(params)),
    ),
  },
} satisfies Record<string, Partial<Record<string, Handler>>>
