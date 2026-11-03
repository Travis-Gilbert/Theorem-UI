// STAND-IN, development only. Nothing in this file ships in the production bundle.
//
// In production the page's origin is the Theorem UI product server: it holds the credential,
// answers `GET /api/environment/v1/bootstrap` (a CSRF token bound to the signed-in session) and
// forwards `/api/environment/v1/*` to the workspace host with the bearer, tenant and caller
// headers the host requires. This file does the same three things for a local `apps/theorem-ide-host --http`
// so the page can be driven in a browser without that server. It is not an authentication
// system: the CSRF token is a random value for the life of the dev server, and the bearer comes
// from a file outside the repository. Evidence captured through it is `live-local` against the
// real workspace host and `stand-in` for everything the product server would do.
//
// SOURCING: the host's own route table (apps/theorem-ide-host/src/http.rs) defines what is
// forwarded and what credential it wants; the SDK's `EnvironmentBootstrap` defines the bootstrap
// reply. Web `Request`/`Response` carry the exchange, so SSE streams (the live endpoint) pass through
// unbuffered.

export interface StandInOptions {
  /** Where `theorem-ide-host --http` listens, e.g. `http://127.0.0.1:8791`. */
  hostUrl: string
  /** The tenant the host was started with (`x-theorem-tenant`). */
  tenant: string
  /**
   * The caller the product server would name (`x-theorem-actor`, and the bootstrap's principal). The
   * host keys per-user state by it and refuses a state call that names none.
   */
  actor: string
  /** The host's bearer credential. Read it from a file outside the repository. */
  token: string
  fetch?: typeof fetch
  /** Fixed for tests; random otherwise. */
  csrfToken?: string
}

const PREFIX = '/api/environment/v1/'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Handles the product server's `/api/environment/v1/*` surface; undefined for any other path. */
export function createStandIn(options: StandInOptions): (request: Request) => Promise<Response | undefined> {
  const csrfToken = options.csrfToken ?? crypto.randomUUID()
  const send = options.fetch ?? fetch
  return async (request) => {
    const url = new URL(request.url)
    if (!url.pathname.startsWith(PREFIX)) return undefined

    if (url.pathname === `${PREFIX}bootstrap` && request.method === 'GET') {
      return json(200, {
        schema: 'theorem-environment/1',
        tenantId: options.tenant,
        principalId: options.actor,
        csrfToken,
      })
    }

    if (!SAFE_METHODS.has(request.method) && request.headers.get('x-csrf-token') !== csrfToken) {
      return json(403, { code: 'csrf_refused', message: 'Missing or wrong X-CSRF-Token (stand-in product server)' })
    }

    const headers = new Headers(request.headers)
    for (const name of ['host', 'cookie', 'x-csrf-token', 'connection', 'content-length']) headers.delete(name)
    headers.set('authorization', `Bearer ${options.token}`)
    headers.set('x-theorem-tenant', options.tenant)
    headers.set('x-theorem-actor', options.actor)

    const hasBody = !SAFE_METHODS.has(request.method) && request.body !== null
    const upstream = await send(new URL(`${url.pathname}${url.search}`, options.hostUrl), {
      method: request.method,
      headers,
      signal: request.signal,
      ...(hasBody ? { body: request.body, duplex: 'half' } : {}),
    } as RequestInit)
    const reply = new Headers(upstream.headers)
    for (const name of ['content-encoding', 'content-length', 'transfer-encoding', 'connection']) reply.delete(name)
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: reply })
  }
}
