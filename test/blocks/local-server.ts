// The local server's block routes as the block views' tests need them: fetch
// spied on (the block listener's origin, the compile store, last-run values,
// the state document, app links) and an EventSource that never speaks. There
// is no block listener behind the origin: happy-dom loads no frame pages and
// reports each one it skips, which this keeps out of the test output.
import { spyOn } from 'bun:test'
import { compileCell } from '@/lib/blocks/compile'

export const BLOCK_ORIGIN = 'http://127.0.0.1:9'

class SilentEventSource {
  onopen: (() => void) | null = null
  onmessage: (() => void) | null = null
  onerror: (() => void) | null = null
  close() {}
}

export interface LocalServer {
  /** Each request, as `METHOD path?query`. */
  requests: Array<string>
  /**
   * Compiles a source in the test process into the compile store, so the
   * app's sessions find it there instead of starting the compile worker.
   */
  compiled: (source: string) => Promise<string>
  restore: () => void
}

export function stubLocalServer(): LocalServer {
  const requests: Array<string> = []
  const store = new Map<string, string>()
  const realEventSource = globalThis.EventSource
  globalThis.EventSource = SilentEventSource as unknown as typeof EventSource
  const spy = spyOn(globalThis, 'fetch').mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    requests.push(`${method} ${url.pathname}${url.search}`)
    if (url.pathname === '/desktop/blocks')
      return Response.json({ origin: BLOCK_ORIGIN })
    if (url.pathname === '/desktop/blocks/app-token') {
      const { path } = JSON.parse(String(init?.body)) as { path: string }
      return Response.json({
        url: `${BLOCK_ORIGIN}/app/token/${encodeURIComponent(path)}`,
      })
    }
    if (url.pathname.endsWith('/compiled')) {
      const key = url.searchParams.get('key') ?? ''
      if (method === 'PUT') {
        store.set(key, String(init?.body))
        return new Response(null, { status: 204 })
      }
      const found = store.get(key)
      return found
        ? new Response(found, {
            headers: { 'content-type': 'application/json' },
          })
        : new Response('not found', { status: 404 })
    }
    if (url.pathname.endsWith('/last-run'))
      return method === 'GET'
        ? new Response('not found', { status: 404 })
        : new Response(null, { status: 204 })
    if (url.pathname.endsWith('/state')) return new Response(new Uint8Array())
    return new Response('not found', { status: 404 })
  }) as typeof fetch)
  const report = console.error.bind(console)
  const quiet = spyOn(console, 'error').mockImplementation((...args) => {
    const [first] = args
    const message =
      typeof first === 'object' && first !== null && 'message' in first
        ? String(first.message)
        : String(first)
    if (!message.includes('Iframe page loading is disabled')) report(...args)
  })
  return {
    requests,
    compiled: async (source) => {
      const cell = await compileCell(source)
      store.set(cell.key, JSON.stringify(cell))
      return cell.key
    },
    restore: () => {
      spy.mockRestore()
      quiet.mockRestore()
      globalThis.EventSource = realEventSource
    },
  }
}
