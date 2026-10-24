// SOURCING: bun:test over the bridge relay: JSON-RPC in through the handler's
// own fetch (h3), out to a fake host over the control channel (test/desktop.ts).
import { describe, expect, test } from 'bun:test'
import { H3 } from 'nitro/h3'
import {
  TEST_ORIGIN,
  startFakeHost,
  useDesktopEnv,
} from '../../../test/desktop'
import rpc from './rpc'

const app = new H3().post('/desktop/host/rpc', rpc)

function post(body: unknown, headers: Record<string, string> = {}) {
  return app.fetch(
    new Request(`${TEST_ORIGIN}/desktop/host/rpc`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: TEST_ORIGIN,
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  )
}

const request = (id: number, method: string, params?: unknown) => ({
  jsonrpc: '2.0',
  id,
  method,
  params,
})

describe('POST /desktop/host/rpc', () => {
  useDesktopEnv()

  test('relays a call to the host and returns its result', async () => {
    const host = startFakeHost()
    host.answer = () => ({ result: { path: '/Users/me/Notes', name: 'Notes' } })
    const response = await post(request(1, 'pickFolder'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { path: '/Users/me/Notes', name: 'Notes' },
    })
    expect(host.received).toEqual([
      {
        ctl: 'rpc',
        id: expect.any(Number),
        call: { method: 'pickFolder', params: {} },
      },
    ])
  })

  test("passes the host's error through with its code", async () => {
    const host = startFakeHost()
    host.answer = () => ({
      error: { code: -32001, message: 'Not inside a granted folder' },
    })
    const response = await post(
      request(2, 'openNativeEditor', { path: '/etc/hosts' }),
    )
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      id: 2,
      error: { code: -32001, message: 'Not inside a granted folder' },
    })
  })

  test('refuses methods outside HostCall without reaching the host', async () => {
    const host = startFakeHost()
    const response = await post(request(3, 'eval', { code: '1' }))
    expect(await response.json()).toMatchObject({
      id: 3,
      error: { code: -32601 },
    })
    expect(host.received).toEqual([])
  })

  test('refuses params the host could not parse without reaching it', async () => {
    const host = startFakeHost()
    for (const [id, method, params] of [
      [4, 'notify', { body: 'no title' }],
      [5, 'setDocumentEdited', { edited: 'yes' }],
      [6, 'openExternal', ['https://example.com']],
    ] as const) {
      expect(
        await (await post(request(id, method, params))).json(),
      ).toMatchObject({
        id,
        error: { code: -32602 },
      })
    }
    expect(host.received).toEqual([])
  })

  test('sends the host only the fields its HostCall names', async () => {
    const host = startFakeHost()
    await post(request(7, 'notify', { title: 'Saved', sneaky: true }))
    expect(host.received).toMatchObject([
      {
        ctl: 'rpc',
        call: { method: 'notify', params: { title: 'Saved', body: null } },
      },
    ])
  })

  test('refuses other origins and other content types', async () => {
    startFakeHost()
    expect(
      (await post(request(8, 'pickFolder'), { origin: 'null' })).status,
    ).toBe(403)
    expect(
      (await post(request(9, 'pickFolder'), { 'content-type': 'text/plain' }))
        .status,
    ).toBe(415)
  })

  test('is not found outside desktop mode', async () => {
    delete process.env.THEOREM_DESKTOP
    expect((await post(request(10, 'pickFolder'))).status).toBe(404)
  })
})
