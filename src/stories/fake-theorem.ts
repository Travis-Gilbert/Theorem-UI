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

/** Where a fake keeps the fetch it stands in for. */
const PAGE_FETCH = Symbol('page fetch')
type Fetch = typeof window.fetch & { [PAGE_FETCH]?: typeof window.fetch }

/**
 * Answers this origin's `/api/` from the map and leaves the dev server's own
 * requests, and every other host's, alone.
 * A second install replaces the first instead of wrapping it, so restoring
 * either one gives the page its own fetch back.
 */
export function installFakeTheorem(routes: FakeRoutes) {
  const current: Fetch = window.fetch
  const real = current[PAGE_FETCH] ?? current
  const table = Object.entries(routes).map(([key, answer]) => {
    const [method = 'GET', pathname = ''] = key.split(' ')
    return { method, pattern: new URLPattern({ pathname }), answer }
  })
  const fake = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    // Only this origin's API is Theorem's: another host's `/api/` (a model hub, say) is that host's to answer.
    // A page with no origin of its own (about:blank, as a test has) has no other hosts to tell apart.
    const here = window.location.origin
    const ours = here === 'null' || url.origin === here
    if (!ours || !url.pathname.startsWith('/api/')) return real(input, init)
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
  window.fetch = Object.assign(fake, {
    preconnect: real.preconnect,
    [PAGE_FETCH]: real,
  })
  return () => {
    window.fetch = real
  }
}
