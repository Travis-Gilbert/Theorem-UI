// Session renewal against a fake Keychain and token server: what survives a
// sign-out mid-refresh, a newer sign-in, an outage and a refused refresh token.
import { beforeEach, describe, expect, mock, test } from 'bun:test'

const AUTHORITY = 'https://theorem.test'
const keychain = new Map<string, string>()

mock.module('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
  getItemAsync: async (key: string) => keychain.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void keychain.set(key, value),
  deleteItemAsync: async (key: string) => void keychain.delete(key),
}))
mock.module('expo-crypto', () => ({}))
mock.module('expo-web-browser', () => ({}))
mock.module('./config', () => ({
  config: { authority: AUTHORITY, oauthClientId: 'theorem-ios', oauthRedirectUri: `${AUTHORITY}/ios/callback` },
}))
;(globalThis as { __DEV__?: boolean }).__DEV__ = true

const auth = await import('./auth')

type Answer = { status: number; body: unknown }
let tokenAnswers: Promise<Answer>[] = []
let tokenRequests = 0

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input)
  if (url.endsWith('/.well-known/oauth-authorization-server'))
    return Response.json({
      issuer: AUTHORITY,
      authorization_endpoint: `${AUTHORITY}/oauth/authorize`,
      token_endpoint: `${AUTHORITY}/oauth/token`,
    })
  tokenRequests += 1
  const answer = await (tokenAnswers.shift() ?? Promise.resolve({ status: 500, body: {} }))
  return Response.json(answer.body, { status: answer.status })
}) as typeof fetch

function deferred() {
  let resolve!: (answer: Answer) => void
  const promise = new Promise<Answer>((done) => (resolve = done))
  return { promise, resolve }
}

const now = () => Math.floor(Date.now() / 1000)
const KEY = 'theorem.session'
const saved = () => (keychain.has(KEY) ? JSON.parse(keychain.get(KEY)!) : undefined)

/** A signed-in session whose access token expires in `seconds`. */
async function signedInExpiringIn(seconds: number) {
  keychain.set(
    KEY,
    JSON.stringify({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: now() + seconds, authority: AUTHORITY, kind: 'oauth' }),
  )
  await auth.restore()
}

const renewed = { status: 200, body: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 } }

beforeEach(() => {
  keychain.clear()
  tokenAnswers = []
  tokenRequests = 0
})

describe('renewing a session', () => {
  test('a refresh that lands after sign-out saves nothing', async () => {
    await signedInExpiringIn(30)
    const answer = deferred()
    tokenAnswers.push(answer.promise)
    const pending = auth.bearer()
    await Bun.sleep(0)
    await auth.signOut()
    answer.resolve(renewed)
    expect(await pending).toBeUndefined()
    expect(saved()).toBeUndefined()
  })

  test('a refresh that lands after a newer sign-in leaves the newer session in place', async () => {
    await signedInExpiringIn(30)
    const answer = deferred()
    tokenAnswers.push(answer.promise)
    const pending = auth.bearer()
    await Bun.sleep(0)
    await auth.signInWithDevelopmentToken('newer-session')
    answer.resolve(renewed)
    expect(await pending).toBe('newer-session')
    expect(saved()?.accessToken).toBe('newer-session')
    expect(await auth.bearer()).toBe('newer-session')
  })

  test('requests during one refresh share it, so the rotated token is used once', async () => {
    await signedInExpiringIn(30)
    const answer = deferred()
    tokenAnswers.push(answer.promise)
    const both = Promise.all([auth.bearer(), auth.bearer()])
    await Bun.sleep(0)
    answer.resolve(renewed)
    expect(await both).toEqual(['new-access', 'new-access'])
    expect(tokenRequests).toBe(1)
    expect(saved()?.refreshToken).toBe('new-refresh')
  })

  test('a server error keeps the session and the token that still works', async () => {
    await signedInExpiringIn(30)
    tokenAnswers.push(Promise.resolve({ status: 503, body: {} }))
    expect(await auth.bearer()).toBe('old-access')
    expect(saved()?.refreshToken).toBe('old-refresh')
  })

  test('a server error after expiry fails the request and keeps the session', async () => {
    await signedInExpiringIn(-5)
    tokenAnswers.push(Promise.resolve({ status: 500, body: { error: 'server_error' } }))
    await expect(auth.bearer()).rejects.toThrow('could not renew')
    expect(saved()?.refreshToken).toBe('old-refresh')
  })

  test('a refused refresh token ends the session', async () => {
    await signedInExpiringIn(30)
    tokenAnswers.push(Promise.resolve({ status: 400, body: { error: 'invalid_grant' } }))
    expect(await auth.bearer()).toBeUndefined()
    expect(saved()).toBeUndefined()
  })
})
