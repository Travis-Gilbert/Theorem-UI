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
let lastDeviceRequest
// What the fake issuer answers a device code poll with.
let deviceAnswer = 'authorization_pending'
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
        device_authorization_endpoint: issuer.url.origin + '/device/code',
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
        theorem_identity_providers: [
          { id: 'github', name: 'GitHub' },
          { id: 'oidc', name: 'email' },
          { id: 42 },
        ],
      })
    if (url.pathname === '/device/code') {
      lastDeviceRequest = new URLSearchParams(await request.text())
      return Response.json({
        device_code: 'device-secret',
        user_code: 'BCDF-GHJK',
        verification_uri: issuer.url.origin + '/device',
        verification_uri_complete:
          issuer.url.origin + '/device?user_code=BCDF-GHJK',
        expires_in: 600,
        interval: 5,
      })
    }
    if (url.pathname === '/token') {
      exchanges++
      lastGrant = new URLSearchParams(await request.text())
      if (
        lastGrant.get('grant_type') ===
          'urn:ietf:params:oauth:grant-type:device_code' &&
        deviceAnswer !== 'approved'
      )
        return deviceAnswer === 'down'
          ? new Response('upstream unavailable', { status: 503 })
          : Response.json({ error: deviceAnswer }, { status: 400 })
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
// An issuer that is not Theorem's own: it names no ways in, and the resource
// its tokens are for is somewhere else.
const elsewhere = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/.well-known/oauth-authorization-server')
      return Response.json({
        issuer: elsewhere.url.origin,
        authorization_endpoint: elsewhere.url.origin + '/oauth2/authorize',
        token_endpoint: elsewhere.url.origin + '/oauth2/token',
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
      })
    if (url.pathname === '/oauth2/token') {
      lastGrant = new URLSearchParams(await request.text())
      return Response.json({
        access_token: 'elsewhere-access',
        refresh_token: 'elsewhere-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
      })
    }
    return new Response(null, { status: 404 })
  },
})
const {
  signIn,
  signInCallback,
  personBearer,
  signInOptions,
  startCodeSignIn,
  pollCodeSignIn,
} = await import('../src/server/theorem-auth.ts')
beforeEach(() => {
  cookies.clear()
  exchanges = 0
  lastGrant = undefined
  lastDeviceRequest = undefined
  deviceAnswer = 'authorization_pending'
  process.env.THEOREM_API_URL = issuer.url.origin
  process.env.THEOREM_OAUTH_ISSUER = issuer.url.origin
  process.env.THEOREM_OAUTH_CLIENT_ID = 'test-client'
  process.env.THEOREM_SESSION_SECRET = password
  delete process.env.THEOREM_OAUTH_CLIENT_SECRET
  delete process.env.THEOREM_OAUTH_SCOPE
  delete process.env.THEOREM_OAUTH_RESOURCE
})
afterAll(() => {
  issuer.stop(true)
  elsewhere.stop(true)
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

test('the sign-in page offers the issuer’s ways in and the code sign-in', async () => {
  expect(await signInOptions()).toEqual({
    providers: [
      { id: 'github', name: 'GitHub' },
      { id: 'oidc', name: 'email' },
    ],
    codeSignIn: true,
  })
})

test('a chosen way in reaches the issuer, and one it does not offer is dropped', async () => {
  const chosen = await signIn(
    request('/auth/sign-in?returnTo=%2F&identity_provider=oidc'),
  )
  expect(
    new URL(chosen.headers.get('location')).searchParams.get(
      'identity_provider',
    ),
  ).toBe('oidc')
  const unknown = await signIn(
    request('/auth/sign-in?returnTo=%2F&identity_provider=elsewhere'),
  )
  expect(
    new URL(unknown.headers.get('location')).searchParams.has(
      'identity_provider',
    ),
  ).toBe(false)
})

test('an issuer that names no ways in is asked for the configured scope and resource', async () => {
  process.env.THEOREM_OAUTH_ISSUER = elsewhere.url.origin
  process.env.THEOREM_OAUTH_SCOPE = 'openid  offline_access'
  process.env.THEOREM_OAUTH_RESOURCE = 'https://theorem.test/mcp'
  expect(await signInOptions()).toEqual({ providers: [], codeSignIn: false })

  // A way in left over from another issuer's page is not passed on.
  const response = await signIn(
    request('/auth/sign-in?returnTo=%2F&identity_provider=github'),
  )
  const authorization = new URL(response.headers.get('location'))
  expect(authorization.origin).toBe(elsewhere.url.origin)
  expect(authorization.searchParams.get('scope')).toBe('openid offline_access')
  expect(authorization.searchParams.get('resource')).toBe(
    'https://theorem.test/mcp',
  )
  expect(authorization.searchParams.has('identity_provider')).toBe(false)

  await signInCallback(callback(authorization))
  expect(lastGrant.get('resource')).toBe('https://theorem.test/mcp')
  expect(await personBearer()).toBe('elsewhere-access')

  // The session was granted what this issuer was asked for, so it does not
  // hold Theorem's scopes and ends when those are asked for again.
  delete process.env.THEOREM_OAUTH_SCOPE
  expect(await personBearer()).toBeUndefined()
})

test('a code sign-in keeps its device code sealed and signs in once approved', async () => {
  const code = await startCodeSignIn('/c/thread?view=chat')
  expect(code.userCode).toBe('BCDF-GHJK')
  expect(code.verificationUriComplete).toContain('user_code=BCDF-GHJK')
  expect(code).not.toHaveProperty('deviceCode')
  expect(lastDeviceRequest.get('client_id')).toBe('test-client')
  expect(lastDeviceRequest.get('scope')).toContain('models:invoke')
  expect(cookies.get('theorem_session')).not.toContain('device-secret')

  expect(await pollCodeSignIn()).toEqual({ status: 'pending', interval: 5 })
  deviceAnswer = 'slow_down'
  expect(await pollCodeSignIn()).toEqual({ status: 'pending', interval: 10 })
  deviceAnswer = 'approved'
  expect(await pollCodeSignIn()).toEqual({
    status: 'signed_in',
    returnTo: '/c/thread?view=chat',
  })
  expect(lastGrant.get('device_code')).toBe('device-secret')
  expect(lastGrant.get('resource')).toBe(issuer.url.origin + '/mcp')
  expect(await personBearer()).toBe('test-access')
  // The code is spent; another poll has nothing to wait for.
  expect(await pollCodeSignIn()).toEqual({ status: 'expired' })
})

test('a code outlives a Theorem that cannot be reached', async () => {
  await startCodeSignIn('/')
  deviceAnswer = 'down'
  expect(await pollCodeSignIn()).toEqual({ status: 'unavailable', interval: 5 })
  deviceAnswer = 'temporarily_unavailable'
  expect(await pollCodeSignIn()).toEqual({ status: 'unavailable', interval: 5 })
  deviceAnswer = 'approved'
  expect(await pollCodeSignIn()).toEqual({ status: 'signed_in', returnTo: '/' })
})

test('a refused code says so and forgets the device code', async () => {
  await startCodeSignIn('/')
  deviceAnswer = 'access_denied'
  expect(await pollCodeSignIn()).toEqual({ status: 'denied' })
  expect(await pollCodeSignIn()).toEqual({ status: 'expired' })
  expect(await personBearer()).toBeUndefined()
})
