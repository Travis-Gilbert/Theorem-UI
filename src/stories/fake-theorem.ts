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

/** Answers `/api/` from the map and leaves the dev server's own requests alone. */
export function installFakeTheorem(routes: FakeRoutes) {
  const real = window.fetch
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
  window.fetch = Object.assign(fake, { preconnect: real.preconnect })
  return () => {
    window.fetch = real
  }
}
