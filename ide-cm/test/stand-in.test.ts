// FIXTURE (evidence grade: fixture). The development stand-in for the product server, against a
// fake host that records what it was sent. The same fixture holds the allowed and the refused
// case, so a stand-in that refused everything (or allowed everything) cannot pass.

import { describe, expect, test } from 'bun:test'
import { createStandIn } from '../dev/workspace-stand-in'

interface Seen {
  url: string
  method: string
  headers: Headers
  body: string
}

function setup(reply: () => Response = () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } })) {
  const seen: Seen[] = []
  const fakeHost = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    seen.push({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body ? await request.text() : '',
    })
    return reply()
  }) as typeof fetch
  const handle = createStandIn({
    hostUrl: 'http://host.test:9',
    tenant: 'tenant-a',
    actor: 'ada',
    token: 'secret-token',
    fetch: fakeHost,
    csrfToken: 'csrf-1',
  })
  return { handle, seen }
}

const request = (path: string, init?: RequestInit) => new Request(`http://page.test${path}`, init)

describe('workspace stand-in', () => {
  test('bootstrap answers the SDK shape and carries the CSRF token', async () => {
    const { handle, seen } = setup()
    const reply = await handle(request('/api/environment/v1/bootstrap'))
    expect(reply?.status).toBe(200)
    expect(await reply?.json()).toEqual({
      schema: 'theorem-environment/1',
      tenantId: 'tenant-a',
      principalId: 'ada',
      csrfToken: 'csrf-1',
    })
    expect(seen).toHaveLength(0)
  })

  test('refuses a write without the CSRF token and forwards one with it', async () => {
    const { handle, seen } = setup()
    const body = JSON.stringify({ workspace_id: 'demo' })
    const refused = await handle(request('/api/environment/v1/workspaces', { method: 'POST', body }))
    expect(refused?.status).toBe(403)
    expect(seen).toHaveLength(0)

    const wrong = await handle(
      request('/api/environment/v1/workspaces', { method: 'POST', body, headers: { 'x-csrf-token': 'nope' } }),
    )
    expect(wrong?.status).toBe(403)

    const allowed = await handle(
      request('/api/environment/v1/workspaces', { method: 'POST', body, headers: { 'x-csrf-token': 'csrf-1' } }),
    )
    expect(allowed?.status).toBe(200)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.method).toBe('POST')
    expect(seen[0]!.url).toBe('http://host.test:9/api/environment/v1/workspaces')
    expect(seen[0]!.body).toBe(body)
  })

  test('the host sees its bearer, tenant and caller, never the page credential headers', async () => {
    const { handle, seen } = setup()
    await handle(
      request('/api/environment/v1/workspaces/demo/live?cursor=e:1', {
        headers: {
          authorization: 'Bearer page-supplied',
          cookie: 'sid=1',
          'x-csrf-token': 'csrf-1',
          'x-theorem-actor': 'grace',
          'last-event-id': 'e:1',
        },
      }),
    )
    const sent = seen[0]!
    expect(sent.url).toBe('http://host.test:9/api/environment/v1/workspaces/demo/live?cursor=e:1')
    expect(sent.headers.get('authorization')).toBe('Bearer secret-token')
    expect(sent.headers.get('x-theorem-tenant')).toBe('tenant-a')
    // The caller is the one the product server names, never the one the page claims: the host keys
    // per-user state by it and refuses a state call without it.
    expect(sent.headers.get('x-theorem-actor')).toBe('ada')
    expect(sent.headers.get('cookie')).toBeNull()
    expect(sent.headers.get('x-csrf-token')).toBeNull()
    expect(sent.headers.get('last-event-id')).toBe('e:1')
  })

  test('a stream is passed through as it arrives, not buffered to the end', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode('event: hello\n\n'))
        await gate
        controller.enqueue(encoder.encode('event: closed\n\n'))
        controller.close()
      },
    })
    const { handle } = setup(() => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }))
    const reply = await handle(request('/api/environment/v1/workspaces/demo/live'))
    const reader = reply!.body!.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toBe('event: hello\n\n')
    release()
    const second = await reader.read()
    expect(new TextDecoder().decode(second.value)).toBe('event: closed\n\n')
  })

  test('the host status and body come back unchanged', async () => {
    const { handle } = setup(() => new Response('{"code":"stale_revision"}', { status: 409, headers: { 'content-type': 'application/json' } }))
    const reply = await handle(request('/api/environment/v1/workspaces/demo/files'))
    expect(reply?.status).toBe(409)
    expect(await reply?.json()).toEqual({ code: 'stale_revision' })
  })

  test('a path outside the environment surface is not handled', async () => {
    const { handle, seen } = setup()
    expect(await handle(request('/index.html'))).toBeUndefined()
    expect(await handle(request('/api/chat/v1/threads'))).toBeUndefined()
    expect(seen).toHaveLength(0)
  })
})
