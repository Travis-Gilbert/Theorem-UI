// SOURCING: the platform's URLPattern and window.fetch. Stories answer the client's own requests, so the real hooks and the real SDK client run. Not msw: lib/theorem/client already calls window.fetch at call time, and msw's service worker would ship through public/ into production builds.

export type FakeAnswer = (
  params: Record<string, string>,
  request: Request,
) => unknown | Response | Promise<unknown | Response>

/** `GET /api/chat/v1/threads/:threadId`, and what it answers. */
export type FakeRoutes = Readonly<Record<string, FakeAnswer>>

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** The platform's fetch, kept on every fake so a second install answers over it, not over the first. */
const REAL = Symbol('real fetch')
type Fetch = typeof window.fetch & { [REAL]?: typeof window.fetch }

/**
 * Answers `/api/` from the map and leaves the dev server's own requests alone.
 * Restoring takes out only this install: a story mounted again renders its
 * install before the last one's cleanup runs, and that cleanup must not put
 * the platform's fetch back under the new one.
 */
export function installFakeTheorem(routes: FakeRoutes) {
  const current: Fetch = window.fetch
  const real = current[REAL] ?? current
  const table = Object.entries(routes).map(([key, answer]) => {
    const [method = 'GET', pathname = ''] = key.split(' ')
    return { method, pattern: new URLPattern({ pathname }), answer }
  })
  const fake = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return real(input, init)
    for (const { method, pattern, answer } of table) {
      if (method !== request.method) continue
      const match = pattern.exec(url)
      if (!match) continue
      const params = match.pathname.groups as Record<string, string>
      const result = await answer(params, request)
      return result instanceof Response ? result : json(200, result)
    }
    return json(404, { title: 'Not in this story', path: url.pathname })
  }
  const installed: Fetch = Object.assign(fake, {
    preconnect: real.preconnect,
    [REAL]: real,
  })
  window.fetch = installed
  return () => {
    if (window.fetch === installed) window.fetch = real
  }
}
