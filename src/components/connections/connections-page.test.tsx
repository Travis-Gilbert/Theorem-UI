// SOURCING: bun:test and the block render helpers over the Connections settings sections, with stories/fake-theorem answering the Connections and Work routes from a small in-memory model; no Theorem is running
import { act } from 'react'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { installFakeTheorem } from '@/stories/fake-theorem'
import type {
  Connection,
  GithubConnection,
  GithubDelivery,
  McpServer,
} from '@/lib/theorem/connections'
import type { WorkSettings } from '@/lib/theorem/work-consequences'
import { cleanup, render, waitFor } from '../../../test/blocks/render'
import { GithubSection } from './github-card'
import { McpServers } from './mcp-servers'
import { OtherConnections } from './other-connections'

const page = (window as unknown as { happyDOM: { setURL: (url: string) => void } })
  .happyDOM
const settings = 'http://localhost:3000/settings/connections'
beforeAll(() => page.setURL(settings))
afterAll(() => page.setURL('about:blank'))

const root = '/api/connections/v1'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** The route's :id arrives still percent-encoded, as the client wrote it. */
const idOf = (params: Record<string, string>) => decodeURIComponent(params.id!)

type Seen = { method: string; path: string; body: unknown; ifMatch: string | null }
let seen: Seen[]
let github: GithubConnection | undefined
let others: Connection[]
let servers: McpServer[]
let deliveries: GithubDelivery[]
let work: WorkSettings
/** A status the next write to this method and path is refused with. */
let refuse: Record<string, { status: number; detail: string } | undefined>
let restore: () => void = () => {}
let client: QueryClient

const githubFixture = (changes: Partial<GithubConnection> = {}): GithubConnection => ({
  id: 'github',
  kind: 'github',
  label: 'GitHub',
  status: 'connected',
  enabled: true,
  account: { label: 'travis' },
  health: { state: 'ok', checkedAt: new Date().toISOString() },
  installations: [
    {
      id: 1,
      account: 'travis',
      repositorySelection: 'selected',
      repos: [
        { id: 11, fullName: 'travis/api', private: true, tracked: true },
        { id: 12, fullName: 'travis/web', private: false, tracked: true },
        { id: 13, fullName: 'travis/docs', private: false, tracked: false },
      ],
    },
  ],
  availableActions: [
    { name: 'search_code', title: 'Search code', effect: 'read', granted: true },
    { name: 'create_issue', title: 'Create an issue', effect: 'write', granted: true },
  ],
  subscribedEvents: ['push', 'pull_request'],
  webhook: {
    configured: true,
    counts: { received: 9, processed: 7, pending: 1, failed: 1 },
  },
  ...changes,
})

const serverFixture = (changes: Partial<McpServer> = {}): McpServer => ({
  id: 'mcp:docs',
  kind: 'mcp',
  label: 'Docs search',
  status: 'connected',
  enabled: true,
  health: { state: 'ok' },
  transport: 'http',
  url: 'https://docs.example.com/mcp',
  auth: { type: 'none', configured: false },
  tools: [
    { name: 'search', title: 'Search the docs', effect: 'read', enabled: true },
    { name: 'publish', effect: 'write', enabled: true },
  ],
  ...changes,
})

const summary = (connection: Connection): Connection => {
  const { id, kind, label, status, enabled, account, health, lastEventAt } =
    connection
  return { id, kind, label, status, enabled, account, health, lastEventAt }
}

function mount(node: React.ReactNode) {
  restore = installFakeTheorem({
    'GET /api/chat/v1/bootstrap': () => ({ csrfToken: 'csrf', tenantId: 't' }),
    [`GET ${root}`]: () => ({
      connections: [
        ...(github ? [summary(github)] : []),
        ...servers.map(summary),
        ...others,
      ],
      stdioAvailable: false,
    }),
    [`GET ${root}/github`]: () => (github ? github : json(404, { title: 'Not connected' })),
    [`POST ${root}/github/connect`]: async (_p, request) => {
      seen.push(await note(request))
      return { authorizationUrl: 'about:blank#github' }
    },
    [`DELETE ${root}/github`]: async (_p, request) => {
      seen.push(await note(request))
      github = undefined
      return new Response(null, { status: 204 })
    },
    [`PATCH ${root}/github`]: async (_p, request) => {
      seen.push(await note(request))
      const refusal = refuse['PATCH github']
      if (refusal) return json(refusal.status, { title: 'Refused', detail: refusal.detail })
      github = { ...github!, ...(seen.at(-1)!.body as object) }
      return github
    },
    [`PUT ${root}/github/repositories`]: async (_p, request) => {
      seen.push(await note(request))
      const tracked = new Set((seen.at(-1)!.body as { tracked: string[] }).tracked)
      github = {
        ...github!,
        installations: github!.installations.map((installation) => ({
          ...installation,
          repos: installation.repos.map((repo) => ({
            ...repo,
            tracked: tracked.has(repo.fullName),
          })),
        })),
      }
      return github
    },
    [`GET ${root}/github/deliveries`]: (_p, request) => {
      const state = new URL(request.url).searchParams.get('state')
      return { deliveries: deliveries.filter((d) => !state || d.state === state) }
    },
    [`POST ${root}/github/deliveries/:id/retry`]: async (params, request) => {
      seen.push(await note(request))
      return deliveries.find((delivery) => delivery.id === params.id)
    },
    [`GET ${root}/mcp`]: () => ({ servers }),
    [`POST ${root}/mcp`]: async (_p, request) => {
      seen.push(await note(request))
      const refusal = refuse['POST mcp']
      if (refusal) return json(refusal.status, { title: 'Refused', detail: refusal.detail })
      const body = seen.at(-1)!.body as { label: string; url: string }
      const added = serverFixture({ id: 'mcp:new', label: body.label, url: body.url })
      servers = [...servers, added]
      return added
    },
    [`PATCH ${root}/mcp/:id`]: async (params, request) => {
      seen.push(await note(request))
      const patch = seen.at(-1)!.body as Partial<McpServer>
      servers = servers.map<McpServer>((server) =>
        server.id === idOf(params) ? { ...server, ...patch } : server,
      )
      return servers.find((server) => server.id === idOf(params))
    },
    [`GET ${root}/mcp/:id`]: (params) =>
      servers.find((server) => server.id === idOf(params)) ?? json(404, {}),
    [`DELETE ${root}/mcp/:id`]: async (params, request) => {
      seen.push(await note(request))
      servers = servers.filter((server) => server.id !== idOf(params))
      return new Response(null, { status: 204 })
    },
    [`POST ${root}/mcp/:id/test`]: async (_p, request) => {
      seen.push(await note(request))
      return { ok: true, latencyMs: 41, toolCount: 2 }
    },
    'GET /api/work/v1/settings': () => work,
    'PUT /api/work/v1/settings': async (_p, request) => {
      seen.push(await note(request))
      work = { ...(seen.at(-1)!.body as WorkSettings), revision: 'w2' }
      return work
    },
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

async function note(request: Request): Promise<Seen> {
  const text = await request.text()
  return {
    method: request.method,
    path: new URL(request.url).pathname,
    body: text ? JSON.parse(text) : undefined,
    ifMatch: request.headers.get('If-Match'),
  }
}

beforeEach(() => {
  // Connecting GitHub sends the window to GitHub; put it back so relative requests resolve.
  page.setURL(settings)
  seen = []
  github = githubFixture()
  others = []
  servers = [
    serverFixture(),
    serverFixture({
      id: 'mcp:broken',
      label: 'Broken one',
      status: 'error',
      health: { state: 'failing', detail: 'The server refused the token.' },
      auth: { type: 'bearer', configured: true },
      tools: [],
    }),
  ]
  deliveries = [
    {
      id: 'd1',
      event: 'push',
      repo: 'travis/api',
      receivedAt: new Date().toISOString(),
      state: 'processed',
      attempts: 1,
      outcomes: [],
    },
    {
      id: 'd2',
      event: 'pull_request',
      action: 'opened',
      repo: 'travis/web',
      receivedAt: new Date().toISOString(),
      state: 'failed',
      attempts: 3,
      error: 'The inbox was unavailable.',
      outcomes: [],
    },
  ]
  work = {
    enabled: true,
    github: { enabled: true, repos: ['travis/api'] },
    consequences: [
      { id: 'push_refreshes_context', enabled: true },
      { id: 'review_request_creates_inbox_entry', enabled: false },
      { id: 'failed_workflow_starts_investigation', enabled: false },
      { id: 'issue_comment_joins_task', enabled: true },
    ],
    sync: { state: 'idle' },
    revision: 'w1',
  }
  refuse = {}
})
afterEach(async () => {
  await cleanup()
  restore()
})

const press = (element: Element) => act(async () => (element as HTMLElement).click())
const text = () => document.body.textContent
const buttonNamed = (name: string) =>
  [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === name)
const named = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)
const settled = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = Object.getPrototypeOf(input) as object
  const { set } = Object.getOwnPropertyDescriptor(prototype, 'value')!
  await act(async () => {
    set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

// ---- GitHub, not connected

test('before GitHub is connected the card says what connecting gives and offers one button', async () => {
  github = undefined
  await mount(<GithubSection />)
  await waitFor(() => buttonNamed('Connect GitHub'))
  expect(text()).toContain('Your agent can search code')
  expect(named('Agent can use GitHub')).toBeNull()
})

test('Connect GitHub asks Theorem to start the sign-in and says where to come back to', async () => {
  github = undefined
  await mount(<GithubSection />)
  await press(await waitFor(() => buttonNamed('Connect GitHub')))
  await waitFor(() => seen.length === 1)
  expect(seen[0]).toMatchObject({
    method: 'POST',
    path: `${root}/github/connect`,
    body: { returnTo: '/settings/connections' },
  })
})

test('a connections list that cannot be read says why and offers another try', async () => {
  restore = installFakeTheorem({
    [`GET ${root}`]: () => json(500, { title: 'Broken', detail: 'The connections store is down.' }),
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await render(
    <QueryClientProvider client={client}>
      <GithubSection />
    </QueryClientProvider>,
  )
  await waitFor(() => text().includes('The connections store is down.'))
  expect(buttonNamed('Try again')).toBeDefined()
})

// ---- GitHub, connected

test('a connected GitHub shows the account, repositories, actions, events and webhook health', async () => {
  await mount(<GithubSection />)
  await waitFor(() => named('Agent can use GitHub'))
  expect(text()).toContain('travis')
  expect(text()).toContain('2 of 3 followed')
  expect(text()).toContain('Search code')
  expect(text()).toContain('Create an issue')
  expect(text()).toContain('pull_request')
  expect(text()).toContain('Configured')
  expect(text()).toContain('9 received, 7 processed, 1 pending, 1 failed')
})

test('the agent switch turns at once and is sent as a patch', async () => {
  await mount(<GithubSection />)
  const toggle = await waitFor(() => named('Agent can use GitHub'))
  expect(toggle.getAttribute('aria-checked')).toBe('true')
  await press(toggle)
  await waitFor(() => seen.some((request) => request.method === 'PATCH'))
  expect(seen.find((request) => request.method === 'PATCH')).toMatchObject({
    path: `${root}/github`,
    body: { enabled: false },
  })
  await waitFor(() => named('Agent can use GitHub')?.getAttribute('aria-checked') === 'false')
})

test('a refused agent switch goes back and shows the refusal', async () => {
  refuse['PATCH github'] = { status: 409, detail: 'GitHub is being reconnected.' }
  await mount(<GithubSection />)
  await press(await waitFor(() => named('Agent can use GitHub')))
  await waitFor(() => text().includes('GitHub is being reconnected.'))
  expect(named('Agent can use GitHub')?.getAttribute('aria-checked')).toBe('true')
})

test('followed repositories are saved only on Save, as one sorted list', async () => {
  await mount(<GithubSection />)
  await waitFor(() => named('Agent can use GitHub'))
  const save = buttonNamed('Save repositories')!
  expect(save.hasAttribute('disabled')).toBe(true)

  const docs = [...document.querySelectorAll('label')].find((row) => row.textContent.includes('travis/docs'))!
  await press(docs)
  expect(buttonNamed('Save repositories')!.hasAttribute('disabled')).toBe(false)
  expect(text()).toContain('3 of 3 followed')
  expect(seen).toEqual([])

  await press(buttonNamed('Save repositories')!)
  await waitFor(() => seen.some((request) => request.method === 'PUT'))
  expect(seen.find((request) => request.method === 'PUT')).toMatchObject({
    path: `${root}/github/repositories`,
    body: { tracked: ['travis/api', 'travis/docs', 'travis/web'] },
  })
})

test('discarding changes puts the checkboxes back without a request', async () => {
  await mount(<GithubSection />)
  await waitFor(() => named('Agent can use GitHub'))
  const docs = [...document.querySelectorAll('label')].find((row) => row.textContent.includes('travis/docs'))!
  await press(docs)
  await press(buttonNamed('Discard changes')!)
  expect(text()).toContain('2 of 3 followed')
  expect(seen).toEqual([])
})

test('each GitHub event consequence is a switch that writes the whole settings document back', async () => {
  await mount(<GithubSection />)
  const inbox = await waitFor(() => named('A review request lands in your work inbox'))
  expect(inbox.getAttribute('aria-checked')).toBe('false')
  await press(inbox)
  await waitFor(() => seen.some((request) => request.method === 'PUT' && request.path === '/api/work/v1/settings'))
  const put = seen.find((request) => request.path === '/api/work/v1/settings')!
  expect(put.ifMatch).toBe('w1')
  expect(put.body).toMatchObject({
    enabled: true,
    github: { enabled: true, repos: ['travis/api'] },
    consequences: [
      { id: 'push_refreshes_context', enabled: true },
      { id: 'review_request_creates_inbox_entry', enabled: true },
      { id: 'failed_workflow_starts_investigation', enabled: false },
      { id: 'issue_comment_joins_task', enabled: true },
    ],
  })
})

test('a Theorem that has no work settings says so instead of showing dead switches', async () => {
  await mount(<GithubSection />)
  restore()
  restore = installFakeTheorem({
    'GET /api/chat/v1/bootstrap': () => ({ csrfToken: 'csrf' }),
    [`GET ${root}`]: () => ({ connections: [summary(github!)], stdioAvailable: false }),
    [`GET ${root}/github`]: () => github,
    [`GET ${root}/github/deliveries`]: () => ({ deliveries: [] }),
  })
  await cleanup()
  await render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GithubSection />
    </QueryClientProvider>,
  )
  await waitFor(() => text().includes('This Theorem does not act on GitHub events yet'))
  expect(named('A push refreshes what Theorem knows')).toBeNull()
})

test('recent deliveries load only when opened, and a failed one can be run again', async () => {
  await mount(<GithubSection />)
  await waitFor(() => named('Agent can use GitHub'))
  expect(text()).not.toContain('The inbox was unavailable.')
  await press(buttonNamed('Recent deliveries')!)
  await waitFor(() => text().includes('The inbox was unavailable.'))
  expect(text()).toContain('3 attempts')
  const retries = [...document.querySelectorAll('button')].filter((button) => button.textContent.trim() === 'Retry')
  expect(retries).toHaveLength(1)
  await press(retries[0]!)
  await waitFor(() => seen.some((request) => request.method === 'POST'))
  expect(seen.find((request) => request.method === 'POST')).toMatchObject({
    path: `${root}/github/deliveries/d2/retry`,
  })
})

test('a GitHub that needs sign-in says so and offers Sign in again', async () => {
  github = githubFixture({
    status: 'needs_auth',
    health: { state: 'failing', detail: 'The token expired.' },
  })
  await mount(<GithubSection />)
  await waitFor(() => buttonNamed('Sign in again'))
  expect(text()).toContain('GitHub needs you to sign in again')
  expect(text()).toContain('The token expired.')
})

test('Disconnect asks first and does nothing until it is confirmed', async () => {
  await mount(<GithubSection />)
  await press(await waitFor(() => buttonNamed('Disconnect')))
  await waitFor(() => text().includes('Disconnect GitHub?'))
  expect(seen).toEqual([])
  await press(buttonNamed('Stay connected')!)
  await settled()
  expect(seen).toEqual([])

  await press(buttonNamed('Disconnect')!)
  await waitFor(() => text().includes('Disconnect GitHub?'))
  const confirm = [...document.querySelectorAll('button')].filter((button) => button.textContent.trim() === 'Disconnect').at(-1)!
  await press(confirm)
  await waitFor(() => seen.some((request) => request.method === 'DELETE'))
  expect(seen.find((request) => request.method === 'DELETE')?.path).toBe(`${root}/github`)
})

// ---- MCP servers

test('MCP servers are listed with their state, and a failing one says why', async () => {
  await mount(<McpServers />)
  await waitFor(() => text().includes('Docs search'))
  expect(text()).toContain('Broken one')
  expect(text()).toContain('https://docs.example.com/mcp')
  expect(text()).toContain('The server refused the token.')
  expect(named('Docs search: agent can use it')?.getAttribute('aria-checked')).toBe('true')
})

test('with no servers it says so and offers to add one', async () => {
  servers = []
  await mount(<McpServers />)
  await waitFor(() => text().includes('No MCP servers yet'))
  expect(buttonNamed('Add server')).toBeDefined()
})

test("a server's switch patches enabled", async () => {
  await mount(<McpServers />)
  await press(await waitFor(() => named('Docs search: agent can use it')))
  await waitFor(() => seen.some((request) => request.method === 'PATCH'))
  expect(seen.find((request) => request.method === 'PATCH')).toMatchObject({
    path: `${root}/mcp/mcp%3Adocs`,
    body: { enabled: false },
  })
})

test('adding a server with nothing filled in shows what is missing and sends nothing', async () => {
  await mount(<McpServers />)
  await waitFor(() => text().includes('Docs search'))
  await press(buttonNamed('Add server')!)
  await waitFor(() => text().includes('Add MCP server'))
  const submit = [...document.querySelectorAll('button')].filter((button) => button.textContent.trim() === 'Add server').at(-1)!
  await press(submit)
  await waitFor(() => text().includes('Give the server a name.'))
  expect(text()).toContain('Enter the server address.')
  expect(seen).toEqual([])
})

test('a server that is added shows the tools it was found to have', async () => {
  await mount(<McpServers />)
  await waitFor(() => text().includes('Docs search'))
  await press(buttonNamed('Add server')!)
  await waitFor(() => text().includes('Add MCP server'))
  await type(document.querySelector<HTMLInputElement>('input[placeholder="Docs search"]')!, 'Release notes')
  await type(
    document.querySelector<HTMLInputElement>('input[placeholder="https://mcp.example.com/mcp"]')!,
    'https://notes.example.com/mcp',
  )
  const submit = [...document.querySelectorAll('button')].filter((button) => button.textContent.trim() === 'Add server').at(-1)!
  await press(submit)
  await waitFor(() => text().includes('Found 2 tools'))
  expect(seen.find((request) => request.method === 'POST')).toMatchObject({
    path: `${root}/mcp`,
    body: {
      label: 'Release notes',
      transport: 'http',
      url: 'https://notes.example.com/mcp',
      auth: { type: 'none' },
    },
  })
  expect(text()).toContain('Search the docs')
  expect(buttonNamed('Review tools')).toBeDefined()
})

test('the GitHub MCP option fills the hosted address and requires a bearer token', async () => {
  await mount(<McpServers />)
  await press(await waitFor(() => buttonNamed('Add server')))
  await press(await waitFor(() => buttonNamed('Use GitHub MCP')))
  const token = await waitFor(() =>
    document.querySelector<HTMLInputElement>('input[type="password"]'),
  )
  const form = token.closest('form')!
  const submit = form.querySelector('button[type="submit"]')!
  await press(submit)
  await waitFor(() => text().includes('Enter the token the server expects.'))
  expect(seen).toEqual([])

  await type(token, 'fixture-token')
  await press(submit)
  await waitFor(() => text().includes('Found 2 tools'))
  expect(seen.find((request) => request.method === 'POST')).toMatchObject({
    path: `${root}/mcp`,
    body: {
      label: 'GitHub MCP',
      transport: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      auth: { type: 'bearer', token: 'fixture-token' },
    },
  })
})

test('a server Theorem refuses keeps the form open and shows the refusal in its words', async () => {
  refuse['POST mcp'] = { status: 422, detail: 'That address resolves to a private network.' }
  await mount(<McpServers />)
  await waitFor(() => text().includes('Docs search'))
  await press(buttonNamed('Add server')!)
  await waitFor(() => text().includes('Add MCP server'))
  await type(document.querySelector<HTMLInputElement>('input[placeholder="Docs search"]')!, 'Internal')
  await type(
    document.querySelector<HTMLInputElement>('input[placeholder="https://mcp.example.com/mcp"]')!,
    'http://10.0.0.5/mcp',
  )
  const submit = [...document.querySelectorAll('button')].filter((button) => button.textContent.trim() === 'Add server').at(-1)!
  await press(submit)
  await waitFor(() => text().includes('That address resolves to a private network.'))
  expect(text()).toContain('Add MCP server')
})

test('Remove asks first, names the server, and deletes only on confirmation', async () => {
  await mount(<McpServers />)
  await press(await waitFor(() => named('Broken one options')))
  const remove = await waitFor(() =>
    [...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent.trim() === 'Remove'),
  )
  await press(remove)
  await waitFor(() => text().includes('Remove Broken one?'))
  expect(seen).toEqual([])
  await press([...document.querySelectorAll('button')].filter((button) => button.textContent.trim() === 'Remove').at(-1)!)
  await waitFor(() => seen.some((request) => request.method === 'DELETE'))
  expect(seen.find((request) => request.method === 'DELETE')?.path).toBe(`${root}/mcp/mcp%3Abroken`)
  await waitFor(() => !text().includes('Broken one'))
})

test('Test connection from the row menu reports what the server answered', async () => {
  await mount(<McpServers />)
  await press(await waitFor(() => named('Docs search options')))
  const testItem = await waitFor(() =>
    [...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent.trim() === 'Test connection'),
  )
  await press(testItem)
  await waitFor(() => text().includes('Connection works: 41 ms, 2 tools.'))
  expect(seen.find((request) => request.method === 'POST')?.path).toBe(`${root}/mcp/mcp%3Adocs/test`)
})

// ---- other connections

test('connections made elsewhere are shown as status only', async () => {
  others = [
    {
      id: 'google_gmail',
      kind: 'google',
      label: 'Gmail',
      status: 'connected',
      enabled: true,
      account: { label: 'travis@example.com' },
      health: { state: 'ok' },
    },
  ]
  await mount(<OtherConnections />)
  await waitFor(() => text().includes('Gmail'))
  expect(text()).toContain('travis@example.com')
  expect(document.querySelector('[role="switch"]')).toBeNull()
})

test('with no other connections the section is not drawn', async () => {
  const { container } = await mount(<OtherConnections />)
  await settled()
  expect(container.textContent).toBe('')
})
