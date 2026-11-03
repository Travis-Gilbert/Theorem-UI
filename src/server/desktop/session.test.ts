// SOURCING: bun:test over the launch-secret exchange, through the handler's
// own fetch (h3).
import { describe, expect, test } from 'bun:test'
import {
  cookieFrom,
  exchange,
  settle,
  startFakeHost,
  useDesktopEnv,
} from '../../../test/desktop'
import session from './session'

const fetchSession = (request: Request) => session.fetch(request)

async function hello(secret: string) {
  startFakeHost().send({ ctl: 'hello', secret, grants: [] })
  await settle()
}

describe('GET /desktop/session', () => {
  useDesktopEnv()

  test('swaps the secret for an HttpOnly, SameSite=Strict session cookie', async () => {
    await hello('launch-secret-1')
    const response = await exchange(fetchSession, 'launch-secret-1')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
    const attributes = (response.headers.get('set-cookie') ?? '').split('; ')
    expect(attributes[0]).toMatch(/^theorem_session=[\w-]{43}$/)
    expect(attributes.slice(1).sort()).toEqual([
      'HttpOnly',
      'Path=/',
      'SameSite=Strict',
    ])
  })

  test('the secret works once', async () => {
    await hello('launch-secret-2')
    expect((await exchange(fetchSession, 'launch-secret-2')).status).toBe(302)
    const again = await exchange(fetchSession, 'launch-secret-2')
    expect(again.status).toBe(403)
    expect(again.headers.get('set-cookie')).toBeNull()
  })

  test('a wrong secret is refused and leaves the right one usable', async () => {
    await hello('launch-secret-3')
    expect((await exchange(fetchSession, 'launch-secret-')).status).toBe(403)
    expect((await exchange(fetchSession, '')).status).toBe(403)
    expect((await exchange(fetchSession, 'launch-secret-3')).status).toBe(302)
  })

  test('each exchange mints a new token', async () => {
    await hello('launch-secret-4')
    const first = cookieFrom(await exchange(fetchSession, 'launch-secret-4'))
    await hello('launch-secret-5')
    const second = cookieFrom(await exchange(fetchSession, 'launch-secret-5'))
    expect(first).not.toBe(second)
  })

  test('is not found outside desktop mode', async () => {
    await hello('launch-secret-6')
    delete process.env.THEOREM_DESKTOP
    expect((await exchange(fetchSession, 'launch-secret-6')).status).toBe(404)
  })
})
