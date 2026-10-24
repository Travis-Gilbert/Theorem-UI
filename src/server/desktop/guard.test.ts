// SOURCING: bun:test over the desktop guard, mounted on an h3 app the way the
// desktop plugin mounts it on Nitro's.
import { beforeEach, describe, expect, test } from 'bun:test'
import { H3 } from 'nitro/h3'
import {
  TEST_HOST,
  TEST_ORIGIN,
  cookieFrom,
  exchange,
  settle,
  startFakeHost,
  useDesktopEnv,
} from '../../../test/desktop'
import { desktopGuard } from './guard'
import plugin from './plugin'
import rpc from './rpc'
import session from './session'

const app = new H3()
  .use(desktopGuard)
  .get('/desktop/session', session)
  .post('/desktop/host/rpc', rpc)
  .get('/', () => 'page')
  .get('/assets/app.js', () => 'asset')

const fetchApp = (request: Request) => app.fetch(request)

function get(path: string, headers: Record<string, string>) {
  return fetchApp(new Request(`${TEST_ORIGIN}${path}`, { headers }))
}

function callRpc(headers: Record<string, string>) {
  return fetchApp(
    new Request(`${TEST_ORIGIN}/desktop/host/rpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'notify',
        params: { title: 'Hi' },
      }),
    }),
  )
}

describe('desktop guard', () => {
  useDesktopEnv()
  let cookie: string

  beforeEach(async () => {
    startFakeHost().send({ ctl: 'hello', secret: 'guard-secret', grants: [] })
    await settle()
    cookie = cookieFrom(await exchange(fetchApp, 'guard-secret'))
  })

  test('the right Host and cookie pass, for pages, assets and the bridge', async () => {
    expect(await (await get('/', { host: TEST_HOST, cookie })).text()).toBe(
      'page',
    )
    expect(
      await (await get('/assets/app.js', { host: TEST_HOST, cookie })).text(),
    ).toBe('asset')
    const response = await callRpc({
      host: TEST_HOST,
      cookie,
      origin: TEST_ORIGIN,
    })
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: null,
    })
  })

  test('another Host is refused, even with the cookie', async () => {
    for (const host of [
      'localhost:4317',
      '127.0.0.1:4318',
      '127.0.0.1',
      'rebind.example:4317',
    ]) {
      expect((await get('/', { host, cookie })).status).toBe(403)
    }
    // The session route needs only the Host, but it does need it.
    expect(
      (
        await get('/desktop/session?secret=guard-secret', {
          host: 'localhost:4317',
        })
      ).status,
    ).toBe(403)
  })

  test('a request without the session cookie is refused', async () => {
    expect((await get('/', { host: TEST_HOST })).status).toBe(403)
    expect((await get('/assets/app.js', { host: TEST_HOST })).status).toBe(403)
    expect(
      (await get('/', { host: TEST_HOST, cookie: 'theorem_session=forged' }))
        .status,
    ).toBe(403)
    expect(
      (await callRpc({ host: TEST_HOST, origin: TEST_ORIGIN })).status,
    ).toBe(403)
  })

  test('a bridge call from Origin null or another origin is refused', async () => {
    expect(
      (await callRpc({ host: TEST_HOST, cookie, origin: 'null' })).status,
    ).toBe(403)
    expect(
      (
        await callRpc({
          host: TEST_HOST,
          cookie,
          origin: 'http://localhost:4317',
        })
      ).status,
    ).toBe(403)
    expect((await callRpc({ host: TEST_HOST, cookie })).status).toBe(403)
  })

  test('is not installed outside desktop mode', () => {
    delete process.env.THEOREM_DESKTOP
    const web = new H3()
    // The plugin touches nothing on the Nitro app but its h3 app.
    plugin({ h3: web } as unknown as Parameters<typeof plugin>[0])
    expect(web['~middleware']).toEqual([])
  })
})
