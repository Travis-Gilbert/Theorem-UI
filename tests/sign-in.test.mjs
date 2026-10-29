import { afterAll, beforeEach, expect, mock, test } from 'bun:test'
import { sealData, unsealData } from 'iron-session'
import { safeReturnTo } from '../src/lib/theorem/auth-navigation.ts'

const cookies = new Map()
let cookieOptions
mock.module('@tanstack/react-start/server', () => ({
  getCookie: (name) => cookies.get(name),
  setCookie: (name, value, options) => {
    cookies.set(name, value)
    cookieOptions = options
  },
}))
const password = 'local-test-session-secret-with-at-least-32-characters'
const priorEnv = { ...process.env }
let exchanges = 0
let lastGrant
const issuer = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/.well-known/oauth-authorization-server')
      return Response.json({
        issuer: issuer.url.origin,
        authorization_endpoint: issuer.url.origin + '/authorize',
        token_endpoint: issuer.url.origin + '/token',
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
      })
    if (url.pathname === '/token') {
      exchanges++
      lastGrant = new URLSearchParams(await request.text())
      if (lastGrant.get('code') === 'expired-code')
        return Response.json({ error: 'invalid_grant' }, { status: 400 })
      return Response.json({
        access_token: 'test-access',
        refresh_token: 'test-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
      })
    }
    return new Response(null, { status: 404 })
  },
})
const { signIn, signInCallback, personBearer } =
  await import('../src/server/theorem-auth.ts')
beforeEach(() => {
  cookies.clear()
  exchanges = 0
  lastGrant = undefined
  process.env.THEOREM_API_URL = issuer.url.origin
  process.env.THEOREM_OAUTH_ISSUER = issuer.url.origin
  process.env.THEOREM_OAUTH_CLIENT_ID = 'test-client'
  process.env.THEOREM_SESSION_SECRET = password
  delete process.env.THEOREM_OAUTH_CLIENT_SECRET
})
afterAll(() => {
  issuer.stop(true)
  process.env = priorEnv
  mock.restore()
})
const request = (path) => new Request('https://theorem.rs' + path)
const begin = async (returnTo = '/c/thread?signin_error=failed&view=chat') => {
  const response = await signIn(
    request('/auth/sign-in?' + new URLSearchParams({ returnTo })),
  )
  return { response, authorization: new URL(response.headers.get('location')) }
}
const callback = (authorization, extras = { code: 'valid-code' }) =>
  request(
    '/auth/callback?' +
      new URLSearchParams({
        state: authorization.searchParams.get('state'),
        ...extras,
      }),
  )
const failure = (response) =>
  new URL(response.headers.get('location'), 'https://theorem.rs')

test('return paths reject external, backslash, and auth-loop destinations', () => {
  for (const value of [
    'https://outside.test',
    '//outside.test',
    '/\\outside.test',
    '/auth/sign-in',
    '/login?returnTo=/auth/callback',
    '/\\%',
  ])
    expect(safeReturnTo(value)).toBe('/')
  expect(safeReturnTo('/c/thread?signin_error=failed&view=chat')).toBe(
    '/c/thread?view=chat',
  )
})
test('unconfigured sign-in renders a recoverable login error', async () => {
  delete process.env.THEOREM_SESSION_SECRET
  expect(
    failure(await signIn(request('/auth/sign-in'))).searchParams.get(
      'signin_error',
    ),
  ).toBe('configuration')
})

test('HTTP sign-in upgrades before setting cookies and sends an HTTPS callback', async () => {
  const response = await signIn(
    new Request('http://theorem.rs/auth/sign-in?returnTo=%2Fc%2Fthread'),
  )
  expect(response.headers.get('location')).toBe(
    'https://theorem.rs/auth/sign-in?returnTo=%2Fc%2Fthread',
  )
  expect(cookies.size).toBe(0)
  const secureResponse = await signIn(
    new Request(response.headers.get('location')),
  )
  expect(
    new URL(secureResponse.headers.get('location')).searchParams.get(
      'redirect_uri',
    ),
  ).toBe('https://theorem.rs/auth/callback')
})

test('HTTP callback upgrades without consuming the pending session or code', async () => {
  const { authorization } = await begin()
  const cookie = cookies.get('theorem_session')
  const insecure = new URL(callback(authorization).url)
  insecure.protocol = 'http:'
  const response = await signInCallback(new Request(insecure))
  expect(response.headers.get('location')).toBe(callback(authorization).url)
  expect(cookies.get('theorem_session')).toBe(cookie)
  expect(exchanges).toBe(0)
  expect(
    (
      await signInCallback(new Request(response.headers.get('location')))
    ).headers.get('location'),
  ).toBe('/c/thread?view=chat')
})

test('local development keeps loopback HTTP callbacks', async () => {
  for (const origin of [
    'http://localhost:3011',
    'http://127.0.0.1:3011',
    'http://[::1]:3011',
  ]) {
    const response = await signIn(new Request(origin + '/auth/sign-in'))
    expect(
      new URL(response.headers.get('location')).searchParams.get(
        'redirect_uri',
      ),
    ).toBe(origin + '/auth/callback')
  }
})
test('start creates a sealed, HttpOnly pending session and PKCE request', async () => {
  const { response, authorization } = await begin()
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
  expect(authorization.searchParams.get('redirect_uri')).toBe(
    'https://theorem.rs/auth/callback',
  )
  expect(cookieOptions.httpOnly).toBe(true)
  expect(cookieOptions.sameSite).toBe('lax')
  expect(cookies.get('theorem_session')).not.toContain(
    authorization.searchParams.get('state'),
  )
})
test('successful callback exchanges with PKCE, stores bearer, and clears stale error', async () => {
  const { authorization } = await begin()
  const response = await signInCallback(callback(authorization))
  expect(response.headers.get('location')).toBe('/c/thread?view=chat')
  expect(await personBearer()).toBe('test-access')
  expect(lastGrant.get('code_verifier')).toBeTruthy()
  expect(lastGrant.get('resource')).toBe(issuer.url.origin + '/mcp')
  expect(exchanges).toBe(1)
})
test('missing cookie has a visible expiry path', async () => {
  const response = await signInCallback(
    request('/auth/callback?code=unused&state=unknown'),
  )
  expect(failure(response).searchParams.get('signin_error')).toBe('expired')
  expect(exchanges).toBe(0)
})
test('wrong state refuses the callback before exchanging a code', async () => {
  const { authorization } = await begin()
  const response = await signInCallback(
    callback(authorization, { state: 'wrong', code: 'unused' }),
  )
  expect(failure(response).searchParams.get('signin_error')).toBe(
    'state_mismatch',
  )
  expect(exchanges).toBe(0)
})
test('old pending session expires and retains the destination for retry', async () => {
  const { authorization } = await begin()
  const data = await unsealData(cookies.get('theorem_session'), { password })
  data.pending.startedAt = Date.now() - 11 * 60 * 1000
  cookies.set('theorem_session', await sealData(data, { password }))
  const response = await signInCallback(callback(authorization))
  expect(failure(response).searchParams.get('signin_error')).toBe('expired')
  expect(failure(response).searchParams.get('returnTo')).toBe(
    '/c/thread?view=chat',
  )
  expect(exchanges).toBe(0)
})
test('GitHub cancellation is recoverable without leaking provider details', async () => {
  const { authorization } = await begin()
  const response = await signInCallback(
    callback(authorization, {
      error: 'access_denied',
      error_description: 'private-provider-detail',
    }),
  )
  expect(failure(response).searchParams.get('signin_error')).toBe(
    'access_denied',
  )
  expect(response.headers.get('location')).not.toContain(
    'private-provider-detail',
  )
  expect(exchanges).toBe(0)
})
test('expired authorization code is explained and a new sign-in can succeed', async () => {
  const { authorization } = await begin()
  const response = await signInCallback(
    callback(authorization, { code: 'expired-code' }),
  )
  expect(failure(response).searchParams.get('signin_error')).toBe(
    'invalid_grant',
  )
  const retry = await begin(failure(response).searchParams.get('returnTo'))
  expect(
    (await signInCallback(callback(retry.authorization))).headers.get(
      'location',
    ),
  ).toBe('/c/thread?view=chat')
})
test('reloading a consumed callback cannot exchange the code twice', async () => {
  const { authorization } = await begin()
  await signInCallback(callback(authorization))
  expect(
    failure(await signInCallback(callback(authorization))).searchParams.get(
      'signin_error',
    ),
  ).toBe('expired')
  expect(exchanges).toBe(1)
})
