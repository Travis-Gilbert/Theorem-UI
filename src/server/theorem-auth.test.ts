import { beforeEach, expect, mock, test } from 'bun:test'
import { sealData } from 'iron-session'

const ISSUER = 'https://issuer.test'
const PASSWORD = 'test-session-secret-of-32-characters!'
process.env.THEOREM_API_URL = ISSUER
process.env.THEOREM_OAUTH_CLIENT_ID = 'theorem-ui'
process.env.THEOREM_SESSION_SECRET = PASSWORD

const jar = new Map<string, string>()
mock.module('@tanstack/react-start/server', () => ({
  getCookie: (name: string) => jar.get(name),
  setCookie: (name: string, value: string) =>
    value ? jar.set(name, value) : jar.delete(name),
}))

let tokenResponse: () => Response
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(input instanceof Request ? input.url : input)
  if (url.pathname === '/.well-known/oauth-authorization-server')
    return Response.json({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth/authorize`,
      token_endpoint: `${ISSUER}/oauth/token`,
    })
  return tokenResponse()
}) as typeof fetch

const { personBearer, safeReturnTo } = await import('./theorem-auth')

// A successful refresh is shared for a minute, so each test has its own token.
let session = 0
beforeEach(async () => {
  jar.clear()
  jar.set(
    'theorem_session',
    await sealData(
      {
        accessToken: 'old',
        refreshToken: `refresh-${++session}`,
        expiresAt: 1,
      },
      { password: PASSWORD },
    ),
  )
})

test('an unreachable Theorem keeps the session, and the next request refreshes it', async () => {
  tokenResponse = () => new Response('Bad Gateway', { status: 502 })
  expect(await personBearer()).toBe('old')
  expect(jar.has('theorem_session')).toBe(true)

  tokenResponse = () =>
    Response.json({
      access_token: 'new',
      token_type: 'bearer',
      expires_in: 3600,
    })
  expect(await personBearer()).toBe('new')
})

test('a refused refresh token ends the session', async () => {
  tokenResponse = () =>
    Response.json({ error: 'invalid_grant' }, { status: 400 })
  expect(await personBearer()).toBeUndefined()
  expect(jar.has('theorem_session')).toBe(false)
})

test('sign-in returns only to paths on this origin', () => {
  const request = new Request('https://theorem.rs/auth/sign-in')
  for (const [value, kept] of [
    ['/c/thread?x=1#end', '/c/thread?x=1#end'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['/\t/evil.example', '/'],
    ['https://evil.example', '/'],
    [null, '/'],
  ] as const)
    expect(safeReturnTo(value, request)).toBe(kept)
})
