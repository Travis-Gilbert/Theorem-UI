// SOURCING: none — request forwarding over the platform fetch/Response APIs; no proxy library fits a streaming passthrough this small
//
// Same-origin proxy to the Theorem authority. The backend's CORS policy only
// admits GET/POST with a few headers, so the browser talks to this origin and
// the server forwards. The bearer is added here and never reaches the browser:
// the signed-in person's token when sign-in is configured, otherwise the
// deployment token. Bodies stream in both directions so run-event SSE is not
// buffered.
import type { ServerRequest } from 'srvx'
import { oauthConfigured, personBearer } from './theorem-auth'

const REQUEST_HEADERS_DROPPED = [
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'accept-encoding',
  'cookie',
  'origin',
  'referer',
  'authorization',
]

const RESPONSE_HEADERS_DROPPED = [
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
  'set-cookie',
]

/**
 * End an event stream when its upstream drops (the authority restarting, say)
 * instead of erroring the response, which the dev server reports as an
 * internal error over the whole page. Clients lose nothing: the SDK already
 * treats a stream that ends before a terminal event as a disconnect.
 */
function endOnUpstreamError<T>(body: ReadableStream<T>): ReadableStream<T> {
  const reader = body.getReader()
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) controller.close()
        else controller.enqueue(value)
      } catch {
        controller.close()
      }
    },
    cancel: (reason) => reader.cancel(reason),
  })
}

export function problem(
  status: number,
  code: string,
  title: string,
  detail: string,
) {
  return Response.json(
    {
      type: 'about:blank',
      title,
      status,
      code,
      correlationId: crypto.randomUUID(),
      detail,
    },
    { status, headers: { 'content-type': 'application/problem+json' } },
  )
}

/** The bearer for this request, or the response that refuses it. */
export async function bearer(): Promise<string | Response> {
  if (!oauthConfigured()) {
    return (
      process.env.THEOREM_API_TOKEN ||
      problem(
        503,
        'theorem_unconfigured',
        'Theorem backend is not configured',
        'Set THEOREM_API_TOKEN, or THEOREM_OAUTH_CLIENT_ID for sign-in, in .env (see .env.example).',
      )
    )
  }
  try {
    return (
      (await personBearer()) ??
      problem(
        401,
        'theorem_signed_out',
        'Sign in to Theorem',
        'Nobody is signed in.',
      )
    )
  } catch (error) {
    return problem(
      503,
      'theorem_unconfigured',
      'Sign-in is not configured',
      error instanceof Error ? error.message : String(error),
    )
  }
}

export async function proxyToTheorem(request: Request): Promise<Response> {
  const base = process.env.THEOREM_API_URL
  if (!base) {
    return problem(
      503,
      'theorem_unconfigured',
      'Theorem backend is not configured',
      'Set THEOREM_API_URL in .env (see .env.example).',
    )
  }
  const token = await bearer()
  if (token instanceof Response) return token

  const incoming = new URL(request.url)
  const target = new URL(incoming.pathname + incoming.search, base)

  const headers = new Headers(request.headers)
  for (const name of REQUEST_HEADERS_DROPPED) headers.delete(name)
  headers.set('authorization', `Bearer ${token}`)

  // Bun.serve closes a connection that is silent for 10 seconds: a run's event
  // stream waiting on the model (Theorem's keep-alive is also 10 seconds), or
  // a reply the authority takes longer than that to start. The SDK's timeout
  // and the request's abort signal bound the wait instead. srvx hands each
  // request its Bun server.
  ;(request as ServerRequest).runtime?.bun?.server.timeout(request, 0)

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      signal: request.signal,
      redirect: 'manual',
      // Required by undici when streaming a request body.
      ...(hasBody ? { duplex: 'half' } : {}),
    })
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 })
    return problem(
      502,
      'theorem_unreachable',
      'Theorem backend is unreachable',
      `${target.origin}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const responseHeaders = new Headers(upstream.headers)
  for (const name of RESPONSE_HEADERS_DROPPED) responseHeaders.delete(name)
  let body = upstream.body
  if (
    body &&
    responseHeaders.get('content-type')?.startsWith('text/event-stream')
  ) {
    body = endOnUpstreamError(body)
    responseHeaders.set('cache-control', 'no-cache, no-transform')
    responseHeaders.set('x-accel-buffering', 'no')
  }

  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

export const proxyHandlers = {
  GET: ({ request }: { request: Request }) => proxyToTheorem(request),
  POST: ({ request }: { request: Request }) => proxyToTheorem(request),
  PUT: ({ request }: { request: Request }) => proxyToTheorem(request),
  PATCH: ({ request }: { request: Request }) => proxyToTheorem(request),
  DELETE: ({ request }: { request: Request }) => proxyToTheorem(request),
}
