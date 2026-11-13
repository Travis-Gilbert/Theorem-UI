// Real H3 request and iron-session cookie boundary; upstream is a named test
// stand-in. Live Cloudflare and native server acceptance remain separate gates.
import { afterAll, expect, test } from 'bun:test'
import { H3 } from 'nitro/h3'
import { sealData, unsealData } from 'iron-session'
import filesProxy from './files-proxy'

const settings = [
  'THEOREM_API_URL',
  'THEOREM_OAUTH_CLIENT_ID',
  'THEOREM_SESSION_SECRET',
] as const
const saved = settings.map((key) => process.env[key])
const realFetch = globalThis.fetch
const password = 'test-only-files-session-secret-32-characters'
process.env.THEOREM_API_URL = 'https://files-authority.test'
process.env.THEOREM_OAUTH_CLIENT_ID = 'theorem-ui'
process.env.THEOREM_SESSION_SECRET = password
afterAll(() => {
  globalThis.fetch = realFetch
  settings.forEach((key, i) =>
    saved[i] === undefined
      ? delete process.env[key]
      : (process.env[key] = saved[i]),
  )
})
const app = new H3().all('/api/files/v1/**', filesProxy)

test('Files token refresh returns its rotated session through the H3 response', async () => {
  const cookie = await sealData(
    {
      accessToken: 'expired-files-bearer',
      refreshToken: 'test-only-files-refresh',
      scope:
        'run:read run:write models:invoke graph:read graph:write agency:approve',
      expiresAt: 1,
    },
    { password },
  )
  globalThis.fetch = (async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.pathname === '/.well-known/oauth-authorization-server')
      return Response.json({
        issuer: 'https://files-authority.test',
        authorization_endpoint: 'https://files-authority.test/oauth/authorize',
        token_endpoint: 'https://files-authority.test/oauth/token',
      })
    if (url.pathname === '/oauth/token')
      return Response.json({
        access_token: 'refreshed-files-bearer',
        refresh_token: 'rotated-files-refresh',
        token_type: 'bearer',
        expires_in: 3600,
      })
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer refreshed-files-bearer',
    )
    return Response.json({ vaultId: 'test-vault' })
  }) as typeof fetch
  const response = await app.fetch(
    new Request('https://ui.test/api/files/v1/vault', {
      headers: { cookie: `theorem_session=${cookie}` },
    }),
  )
  expect(response.status).toBe(200)
  const updated = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('theorem_session='))
  expect(updated).toBeDefined()
  const sealed = updated!.split(';')[0].slice('theorem_session='.length)
  expect(await unsealData(sealed, { password })).toMatchObject({
    accessToken: 'refreshed-files-bearer',
    refreshToken: 'rotated-files-refresh',
  })
})

test('Files proxy reads the sealed session without the TanStack router context', async () => {
  const cookie = await sealData(
    {
      accessToken: 'test-only-person-bearer',
      scope:
        'run:read run:write models:invoke graph:read graph:write agency:approve',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
    { password },
  )
  let forwarded = false
  globalThis.fetch = (async (input, init) => {
    expect(String(input)).toBe(
      'https://files-authority.test/api/files/v1/vault?schema=theorem-files%2F1',
    )
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe('Bearer test-only-person-bearer')
    expect(headers.has('cookie')).toBe(false)
    forwarded = true
    return Response.json(
      { vaultId: 'test-vault' },
      { headers: { etag: 'test-etag' } },
    )
  }) as typeof fetch
  const response = await app.fetch(
    new Request('https://ui.test/api/files/v1/vault?schema=theorem-files%2F1', {
      headers: {
        cookie: `theorem_session=${cookie}`,
        authorization: 'Bearer must-not-forward',
      },
    }),
  )
  expect(forwarded).toBe(true)
  expect(response.status).toBe(200)
  expect(response.headers.get('etag')).toBe('test-etag')
  expect(await response.json()).toEqual({ vaultId: 'test-vault' })
})

test('an unauthenticated Files request is refused before forwarding', async () => {
  globalThis.fetch = (() => {
    throw new Error('must not forward')
  }) as unknown as typeof fetch
  const response = await app.fetch(
    new Request('https://ui.test/api/files/v1/vault'),
  )
  expect(response.status).toBe(401)
  expect(await response.json()).toMatchObject({ code: 'theorem_signed_out' })
})

test('Files writes preserve bytes and preconditions and return content before the stream closes', async () => {
  const cookie = await sealData(
    {
      accessToken: 'test-only-person-bearer',
      scope:
        'run:read run:write models:invoke graph:read graph:write agency:approve',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
    { password },
  )
  const bytes = new Uint8Array([0, 255, 127, 10])
  let stream!: ReadableStreamDefaultController<Uint8Array>
  globalThis.fetch = (async (_input, init) => {
    expect(init?.method).toBe('PUT')
    const headers = new Headers(init?.headers)
    expect(headers.get('if-match')).toBe('"revision-17"')
    expect(headers.get('idempotency-key')).toBe('test-write-17')
    expect(await new Response(init?.body).bytes()).toEqual(bytes)
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          stream = controller
          controller.enqueue(bytes)
        },
      }),
      { status: 200, headers: { etag: '"revision-18"' } },
    )
  }) as typeof fetch
  const response = await app.fetch(
    new Request('https://ui.test/api/files/v1/content', {
      method: 'PUT',
      headers: {
        cookie: `theorem_session=${cookie}`,
        'if-match': '"revision-17"',
        'idempotency-key': 'test-write-17',
      },
      body: bytes,
    }),
  )
  const reader = response.body!.getReader()
  try {
    expect(response.headers.get('etag')).toBe('"revision-18"')
    expect(await reader.read()).toEqual({ done: false, value: bytes })
    stream.close()
    expect((await reader.read()).done).toBe(true)
  } finally {
    await reader.cancel()
  }
})
