// SOURCING: bun:test and the block render helpers over an assistant-ui external-store runtime (the thread item whose id keys the choice), TanStack Router (the popover's link to Settings), and stories/fake-theorem answering GET /api/connections/v1/tools in process
import { act } from 'react'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from 'bun:test'
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { installFakeTheorem } from '@/stories/fake-theorem'
import type { FakeRoutes } from '@/stories/fake-theorem'
import type { ToolGroup } from '@/lib/theorem/connections'
import { useToolSelections } from '@/lib/theorem/tool-selection'
import { cleanup, click, render, waitFor } from '../../../test/blocks/render'
import { ComposerConnections } from './composer-connections'

const page = (window as unknown as { happyDOM: { setURL: (url: string) => void } })
  .happyDOM
beforeAll(() => page.setURL('http://localhost:3000/'))
afterAll(() => page.setURL('about:blank'))

const roster: ToolGroup[] = [
  {
    connectionId: 'github',
    label: 'GitHub',
    kind: 'github',
    enabled: true,
    tools: [
      { name: 'search_issues', title: 'Search issues', effect: 'read' },
      { name: 'create_issue', title: 'Create an issue', effect: 'write' },
    ],
  },
  {
    connectionId: 'mcp:abc',
    label: 'Docs server',
    kind: 'mcp',
    enabled: true,
    tools: [{ name: 'search', effect: 'read' }],
  },
  {
    connectionId: 'mcp:off',
    label: 'Switched off',
    kind: 'mcp',
    enabled: false,
    tools: [{ name: 'noop', effect: 'read' }],
  },
]

let restore: () => void = () => {}
let client: QueryClient

function Host() {
  const messages: ThreadMessageLike[] = []
  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: (message: ThreadMessageLike) => message,
    isRunning: false,
    onNew: async () => {},
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerConnections />
    </AssistantRuntimeProvider>
  )
}

async function mount(routes: FakeRoutes, settle = true) {
  restore = installFakeTheorem(routes)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <Host />
      </QueryClientProvider>
    ),
  })
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  const view = await render(<RouterProvider router={router} />)
  if (settle) {
    await waitFor(() => !client.isFetching())
    await act(() => new Promise((resolve) => setTimeout(resolve)))
  }
  return view
}

beforeEach(() => {
  useToolSelections.setState({ byThread: {} })
})
afterEach(async () => {
  await cleanup()
  restore()
})

const chip = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('button[aria-label^="Connections"]')

const named = (label: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`)

async function open(container: HTMLElement) {
  await click(chip(container)!)
  await waitFor(() =>
    /Manage connections|Set up connections|Try again/.test(document.body.textContent),
  )
}

const chosen = () => Object.values(useToolSelections.getState().byThread)

test('with no connections endpoint the control is not in the row', async () => {
  const { container } = await mount({})
  expect(chip(container)).toBeNull()
})

test('while the roster is loading nothing shows in the row', async () => {
  const { container } = await mount(
    { 'GET /api/connections/v1/tools': () => new Promise(() => {}) },
    false,
  )
  expect(chip(container)).toBeNull()
})

test('with nothing connected it says so and links to Settings', async () => {
  const { container } = await mount({
    'GET /api/connections/v1/tools': () => ({ groups: [] }),
  })
  await open(container)
  expect(document.body.textContent).toContain('Nothing is connected yet.')
  const link = [...document.querySelectorAll('a')].find((anchor) =>
    anchor.textContent.includes('Set up connections'),
  )
  expect(link?.getAttribute('href')).toBe('/settings/connections')
  expect(named('Search connections and tools')).toBeNull()
})

test('it lists each connection with its own switch, on by default, and shows no count', async () => {
  const { container } = await mount({
    'GET /api/connections/v1/tools': () => ({ groups: roster }),
  })
  expect(chip(container)?.getAttribute('aria-label')).toBe('Connections')
  await open(container)
  const github = named('GitHub available in this conversation')!
  expect(github.getAttribute('aria-checked')).toBe('true')
  expect(named('Docs server available in this conversation')!.getAttribute('aria-checked')).toBe('true')
  // Off in Settings: it cannot be turned on for one conversation.
  const off = named('Switched off available in this conversation')!
  expect(off.getAttribute('aria-checked')).toBe('false')
  expect(off.hasAttribute('data-disabled')).toBe(true)
  expect(document.body.textContent).toContain('Off in Settings')
  expect(chosen()).toEqual([])
})

test('turning a connection off keeps a choice for the conversation and counts what is on', async () => {
  const { container } = await mount({
    'GET /api/connections/v1/tools': () => ({ groups: roster }),
  })
  await open(container)
  await click(named('GitHub available in this conversation')!)
  expect(chosen()).toEqual([{ connections: ['mcp:abc'] }])
  expect(chip(container)?.getAttribute('aria-label')).toBe('Connections, 1 on')
  expect(chip(container)?.textContent).toContain('1')

  // Back to everything: the choice is the default again and is dropped.
  await click(named('GitHub available in this conversation')!)
  expect(chosen()).toEqual([])
  expect(chip(container)?.getAttribute('aria-label')).toBe('Connections')
})

test("a connection's tools open under it and can be turned off one by one", async () => {
  const { container } = await mount({
    'GET /api/connections/v1/tools': () => ({ groups: roster }),
  })
  await open(container)
  expect(document.body.textContent).not.toContain('Create an issue')
  await click(named('Show the tools of GitHub')!)
  expect(document.body.textContent).toContain('Search issues')
  expect(document.body.textContent).toContain('Create an issue')

  // Clicking the row's label is what a person does; happy-dom toggles twice if the box itself is clicked inside a label.
  const create = [...document.querySelectorAll('label')].find((row) =>
    row.textContent.includes('Create an issue'),
  )!
  await click(create)
  expect(chosen()).toEqual([
    {
      connections: ['github', 'mcp:abc'],
      tools: ['github/search_issues', 'mcp:abc/search'],
    },
  ])
  expect(document.body.textContent).toContain('1 of 2 tools')
})

test('typing narrows the list to matching connections and tools', async () => {
  const { container } = await mount({
    'GET /api/connections/v1/tools': () => ({ groups: roster }),
  })
  await open(container)
  const search = named('Search connections and tools') as HTMLInputElement
  const { set } = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
  await act(async () => {
    set!.call(search, 'create')
    search.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await waitFor(() => !named('Docs server available in this conversation'))
  // The matching tool's connection opens by itself to show it.
  expect(named('GitHub available in this conversation')).not.toBeNull()
  expect(document.body.textContent).toContain('Create an issue')
  expect(document.body.textContent).not.toContain('Search issues')

  await act(async () => {
    set!.call(search, 'zzzzqq')
    search.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await waitFor(() => document.body.textContent.includes('Nothing matches that.'))
})

test('a stored choice that names a removed connection is rewritten against the roster', async () => {
  useToolSelections.setState({ byThread: {} })
  const { container } = await mount({
    'GET /api/connections/v1/tools': () => ({ groups: roster }),
  })
  // The thread key is only known once mounted; seed under it and let the roster reconcile.
  await open(container)
  await click(named('GitHub available in this conversation')!)
  const [key] = Object.keys(useToolSelections.getState().byThread)
  await act(async () => {
    useToolSelections.getState().set(key!, { connections: ['mcp:abc', 'mcp:gone'] })
  })
  await waitFor(() => chosen()[0]?.connections.length === 1)
  expect(chosen()).toEqual([{ connections: ['mcp:abc'] }])
})

test('a roster that fails to load says why and can be tried again', async () => {
  let calls = 0
  const { container } = await mount({
    'GET /api/connections/v1/tools': () => {
      calls += 1
      return calls === 1
        ? new Response(JSON.stringify({ title: 'Down', detail: 'The connections service is down.' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          })
        : { groups: roster }
    },
  })
  await open(container)
  await waitFor(() => document.body.textContent.includes('The connections service is down.'))
  const retry = [...document.querySelectorAll('button')].find(
    (button) => button.textContent.trim() === 'Try again',
  )!
  await click(retry)
  await waitFor(() => named('GitHub available in this conversation'))
})
