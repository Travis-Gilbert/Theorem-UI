// SOURCING: bun:test over the real SDK passthrough and client.mutate, with window.fetch answered in process by stories/fake-theorem; no Theorem is running
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test'
import { installFakeTheorem } from '@/stories/fake-theorem'
import type { FakeRoutes } from '@/stories/fake-theorem'
import { connectionsApi } from './connections'

const page = (window as unknown as { happyDOM: { setURL: (url: string) => void } })
  .happyDOM
beforeAll(() => page.setURL('http://localhost:3000/'))
afterAll(() => page.setURL('about:blank'))

type Seen = {
  method: string
  path: string
  search: string
  body: unknown
  csrf: string | null
  idempotency: string | null
}
let seen: Seen[] = []
let restore: () => void = () => {}

/** Records the request the client made, then answers `reply`. */
const record =
  (reply: unknown = {}) =>
  async (_params: Record<string, string>, request: Request) => {
    const url = new URL(request.url)
    const text = await request.text()
    seen.push({
      method: request.method,
      path: url.pathname,
      search: url.search,
      body: text ? JSON.parse(text) : undefined,
      csrf: request.headers.get('X-CSRF-Token'),
      idempotency: request.headers.get('Idempotency-Key'),
    })
    return reply
  }

const root = '/api/connections/v1'
const routes: FakeRoutes = {
  'GET /api/chat/v1/bootstrap': () => ({ csrfToken: 'csrf', tenantId: 't' }),
  [`GET ${root}`]: record({ connections: [], stdioAvailable: false }),
  [`GET ${root}/github`]: record({}),
  [`POST ${root}/github/connect`]: record({ authorizationUrl: 'https://github.test/x' }),
  [`DELETE ${root}/github`]: record(new Response(null, { status: 204 })),
  [`PATCH ${root}/github`]: record({}),
  [`PUT ${root}/github/repositories`]: record({}),
  [`GET ${root}/github/deliveries`]: record({ deliveries: [] }),
  [`POST ${root}/github/deliveries/:id/retry`]: record({}),
  [`GET ${root}/mcp`]: record({ servers: [] }),
  [`GET ${root}/mcp/:id`]: record({}),
  [`POST ${root}/mcp`]: record({}),
  [`PATCH ${root}/mcp/:id`]: record({}),
  [`DELETE ${root}/mcp/:id`]: record(new Response(null, { status: 204 })),
  [`POST ${root}/mcp/:id/test`]: record({ ok: true }),
  [`POST ${root}/mcp/:id/connect`]: record({ authorizationUrl: 'https://auth.test/x' }),
  [`GET ${root}/tools`]: record({ groups: [] }),
}

beforeEach(() => {
  seen = []
  restore = installFakeTheorem(routes)
})
afterEach(() => restore())

const only = () => {
  expect(seen).toHaveLength(1)
  return seen[0]!
}

test('reads are plain GETs with no body and no mutation headers', async () => {
  await connectionsApi.list()
  await connectionsApi.github()
  await connectionsApi.mcpServers()
  await connectionsApi.mcpServer('mcp:abc')
  expect(seen.map(({ method, path }) => `${method} ${path}`)).toEqual([
    `GET ${root}`,
    `GET ${root}/github`,
    `GET ${root}/mcp`,
    `GET ${root}/mcp/mcp%3Aabc`,
  ])
  for (const request of seen) {
    expect(request.body).toBeUndefined()
    expect(request.csrf).toBeNull()
  }
})

test('every write carries the CSRF token and an idempotency key', async () => {
  await connectionsApi.setGithubEnabled(false)
  await connectionsApi.removeMcpServer('mcp:abc')
  for (const request of seen) {
    expect(request.csrf).toBe('csrf')
    expect(request.idempotency).toMatch(/^[0-9a-f-]{36}$/)
  }
  expect(seen[0]!.idempotency).not.toBe(seen[1]!.idempotency)
})

test('connecting GitHub posts where to come back to', async () => {
  const answer = await connectionsApi.connectGithub('/settings/connections')
  expect(answer.authorizationUrl).toBe('https://github.test/x')
  expect(only()).toMatchObject({
    method: 'POST',
    path: `${root}/github/connect`,
    body: { returnTo: '/settings/connections' },
  })
})

test('the agent switch patches only enabled', async () => {
  await connectionsApi.setGithubEnabled(false)
  expect(only()).toMatchObject({
    method: 'PATCH',
    path: `${root}/github`,
    body: { enabled: false },
  })
})

test('disconnecting GitHub deletes it', async () => {
  await connectionsApi.disconnectGithub()
  expect(only()).toMatchObject({ method: 'DELETE', path: `${root}/github` })
})

test('followed repositories are put as one tracked list of full names', async () => {
  await connectionsApi.saveRepositories(['acme/api', 'acme/web'])
  expect(only()).toMatchObject({
    method: 'PUT',
    path: `${root}/github/repositories`,
    body: { tracked: ['acme/api', 'acme/web'] },
  })
})

test('deliveries ask for a state and a cursor only when given', async () => {
  await connectionsApi.deliveries()
  await connectionsApi.deliveries({ state: 'failed' })
  await connectionsApi.deliveries({ state: 'failed', cursor: 'c2' })
  expect(seen.map((request) => request.search)).toEqual([
    '',
    '?state=failed',
    '?state=failed&cursor=c2',
  ])
})

test('retrying a delivery posts to that delivery', async () => {
  await connectionsApi.retryDelivery('del 1')
  expect(only()).toMatchObject({
    method: 'POST',
    path: `${root}/github/deliveries/del%201/retry`,
  })
})

test('adding a server posts the form as the contract names it', async () => {
  const server = {
    label: 'Docs',
    transport: 'http' as const,
    url: 'https://mcp.example.com/mcp',
    auth: { type: 'bearer' as const, token: 'secret' },
  }
  await connectionsApi.addMcpServer(server)
  expect(only()).toMatchObject({ method: 'POST', path: `${root}/mcp`, body: server })
})

test('editing a server patches the changed fields of that server', async () => {
  await connectionsApi.updateMcpServer('mcp:abc', { label: 'Renamed' })
  expect(only()).toMatchObject({
    method: 'PATCH',
    path: `${root}/mcp/mcp%3Aabc`,
    body: { label: 'Renamed' },
  })
})

test('removing, testing and signing in to a server each address that server', async () => {
  await connectionsApi.removeMcpServer('mcp:abc')
  await connectionsApi.testMcpServer('mcp:abc')
  await connectionsApi.connectMcpServer('mcp:abc', '/settings/connections')
  expect(seen.map(({ method, path }) => `${method} ${path}`)).toEqual([
    `DELETE ${root}/mcp/mcp%3Aabc`,
    `POST ${root}/mcp/mcp%3Aabc/test`,
    `POST ${root}/mcp/mcp%3Aabc/connect`,
  ])
  expect(seen[2]!.body).toEqual({ returnTo: '/settings/connections' })
})

test('the tool roster is one GET, with a search only when asked for', async () => {
  await connectionsApi.tools()
  await connectionsApi.tools('issue')
  expect(seen.map((request) => request.search)).toEqual(['', '?q=issue'])
  expect(seen.every((request) => request.path === `${root}/tools`)).toBe(true)
})

test('no request goes to /mcp on Theorem: the browser speaks only typed routes', async () => {
  await connectionsApi.mcpServers()
  await connectionsApi.testMcpServer('mcp:abc')
  await connectionsApi.tools()
  expect(seen.every((request) => !/^\/mcp(\/|$)/.test(request.path))).toBe(true)
})
