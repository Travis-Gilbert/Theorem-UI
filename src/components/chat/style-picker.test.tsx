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
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { ToastProvider } from '@/components/coss/toast'
import { useShell } from '@/components/shell/shell-state'
import { createResponseStylesFake } from '@/stories/fixtures/response-styles'
import type { ResponseStylesFakeOptions } from '@/stories/fixtures/response-styles'
import { installFakeTheorem } from '@/stories/fake-theorem'
import type { FakeRoutes } from '@/stories/fake-theorem'
import { Thread } from '../assistant-ui/elements/thread.aui'
import { usePendingStyle } from '@/lib/theorem/response-styles'
import { cleanup, render, waitFor } from '../../../test/blocks/render'
import { StylePicker } from './style-picker'

const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => page.setURL('http://localhost:3000/'))
afterAll(() => page.setURL('about:blank'))

/** One project the person made, the inbox, a thread in each. */
const ORGANIZATION = {
  schema: 'theorem-organization/1',
  projects: [
    {
      projectId: 'inbox',
      title: 'Inbox',
      isInbox: true,
      createdBy: 'user',
      threadCount: 1,
      outputCount: 0,
      brief: false,
    },
    {
      projectId: 'p1',
      title: 'Atlas',
      isInbox: false,
      createdBy: 'user',
      threadCount: 1,
      outputCount: 0,
      brief: false,
    },
  ],
  threads: [
    {
      threadId: 't1',
      title: 'In Atlas',
      homeProjectId: 'p1',
      revision: 1,
      createdAtMs: 1,
      memberships: [
        {
          projectId: 'p1',
          by: 'user',
          pinned: false,
          why: '',
          atMs: 1,
          implicit: true,
        },
      ],
      attention: { reasons: [], running: false },
    },
    {
      threadId: 't-inbox',
      title: 'Unsorted',
      homeProjectId: 'inbox',
      revision: 1,
      createdAtMs: 1,
      memberships: [],
      attention: { reasons: [], running: false },
    },
  ],
  librarian: {
    state: 'off',
    paused: false,
    jobs: { membership: { enabled: false }, summary: { enabled: false } },
    queued: 0,
    recent: [],
  },
}

type Sent = { method: string; path: string; body: unknown }
let sent: Sent[]
let restore: (() => void) | undefined
let client: QueryClient

/** Installs the fake backend, recording what the page sends to the selection route. */
function backend(
  options: ResponseStylesFakeOptions | null,
  extra: FakeRoutes = {},
) {
  restore?.()
  const styles = options ? createResponseStylesFake(options).routes : {}
  const watched = Object.fromEntries(
    Object.entries(styles).map(([key, answer]) => [
      key,
      async (params: Record<string, string>, request: Request) => {
        const text = await request.clone().text()
        sent.push({
          method: request.method,
          path: new URL(request.url).pathname,
          body: text ? (JSON.parse(text) as unknown) : undefined,
        })
        return answer(params, request)
      },
    ]),
  )
  restore = installFakeTheorem({
    'GET /api/chat/v1/bootstrap': () => ({
      csrfToken: 'csrf',
      tenantId: 'story',
    }),
    'GET /api/chat/v1/organization': () => ORGANIZATION,
    ...watched,
    ...extra,
  })
}

beforeEach(() => {
  sent = []
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(async () => {
  await cleanup()
  client.clear()
  restore?.()
  usePendingStyle.setState({ styleId: undefined, held: {} })
  useShell.setState({ projectId: undefined })
})

function Runtime({
  threadId,
  children,
}: {
  threadId?: string
  children: React.ReactNode
}) {
  const runtime = useExternalStoreRuntime({
    messages: [],
    convertMessage: (message: ThreadMessageLike) => message,
    isRunning: false,
    onNew: async () => {},
    adapters: {
      threadList: threadId
        ? {
            threadId,
            threads: [{ status: 'regular', id: threadId, remoteId: threadId }],
          }
        : {},
    },
  })
  return (
    <QueryClientProvider client={client}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ToastProvider position="top-center" />
        {children}
      </AssistantRuntimeProvider>
    </QueryClientProvider>
  )
}

/**
 * Renders the picker as the composer does, inside the router the app has (its
 * settings link is a router link), then lets the page's queries settle.
 */
async function mount(threadId?: string) {
  const root = createRootRoute({
    component: () => (
      <Runtime threadId={threadId}>
        <StylePicker />
      </Runtime>
    ),
  })
  const styles = createRoute({
    getParentRoute: () => root,
    path: '/settings/styles',
  })
  const router = createRouter({
    routeTree: root.addChildren([styles]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  const view = await render(<RouterProvider router={router} />)
  await waitFor(() => !client.isFetching())
  await act(() => new Promise((resolve) => setTimeout(resolve)))
  return { ...view, router }
}

const trigger = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('[aria-label="Response style"]')

async function open(container: HTMLElement) {
  const button = await waitFor(() => trigger(container))
  // A menu that was just used is closing.
  await waitFor(() => !document.querySelector('[role="menu"]'))
  await act(() => button.click())
  return waitFor(() => {
    const items = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    ]
    return items.length ? items : undefined
  })
}

const itemNamed = (items: HTMLElement[], name: string) => {
  const found = items.find((item) => item.textContent.startsWith(name))
  if (!found) throw new Error(`no item starting ${name}`)
  return found
}
const menuAction = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent.startsWith(name),
  )
const selectionWrites = () =>
  sent.filter(
    (request) =>
      request.method === 'PUT' && request.path.endsWith('/selection'),
  )

test('a Theorem that does not serve response styles shows no picker', async () => {
  backend(null)
  const { container } = await mount('t1')
  expect(trigger(container)).toBeNull()
  expect(container.textContent).toBe('')
})

test('the trigger names the style the next turn will use, and the first item says what Use my default means', async () => {
  backend({
    selection: {
      account: 'theorem.style.educational',
      projects: { p1: 'theorem.style.formal' },
    },
  })
  const { container } = await mount('t1')
  const button = await waitFor(() => trigger(container))
  expect(button.textContent).toBe('Formal')

  const items = await open(container)
  const inherit = items[0]!
  expect(inherit.textContent).toContain('Use my default — Formal')
  expect(inherit.textContent).toContain("Follows this project's default")
  expect(inherit.getAttribute('aria-checked')).toBe('true')

  // The Default preset is a style like the others, and does not read as the inherit item.
  const preset = itemNamed(items, 'Default')
  expect(preset).not.toBe(inherit)
  expect(preset.textContent).not.toContain('Use my default')
  expect(preset.getAttribute('aria-checked')).toBe('false')
  const names = [
    'Use my default — Formal',
    'Default',
    'Concise',
    'Exploratory',
    'Educational',
    'Formal',
  ]
  expect(items).toHaveLength(names.length)
  names.forEach((name, index) =>
    expect(items[index]!.textContent.startsWith(name)).toBe(true),
  )
})

test('an unsorted conversation inherits the account default, because the inbox has no project default', async () => {
  backend({
    selection: {
      account: 'theorem.style.educational',
      projects: { p1: 'theorem.style.formal' },
    },
  })
  const { container } = await mount('t-inbox')
  expect(trigger(container)?.textContent).toBe('Educational')
  const items = await open(container)
  expect(items[0]!.textContent).toContain('Use my default — Educational')
  expect(items[0]!.textContent).toContain('Follows your default')
  expect(menuAction("Set as this project's default")).toBeUndefined()
  expect(menuAction('Set as my default')).toBeDefined()
})

test("choosing a style on an existing conversation writes that conversation's choice", async () => {
  backend({ selection: { account: 'theorem.style.educational' } })
  const { container } = await mount('t1')
  const items = await open(container)
  await act(() => itemNamed(items, 'Concise').click())

  expect(selectionWrites().map((write) => write.body)).toEqual([
    { scope: 'conversation', threadId: 't1', style: 'theorem.style.concise' },
  ])
  await waitFor(() => trigger(container)?.textContent === 'Concise')
  expect(usePendingStyle.getState().styleId).toBeUndefined()

  // Use my default clears the conversation's choice rather than naming a style.
  const again = await open(container)
  expect(itemNamed(again, 'Concise').getAttribute('aria-checked')).toBe('true')
  await act(() => again[0]!.click())
  expect(selectionWrites().at(-1)?.body).toEqual({
    scope: 'conversation',
    threadId: 't1',
    style: null,
  })
  await waitFor(() => trigger(container)?.textContent === 'Educational')
})

test('choosing before the conversation exists sends nothing yet, and rides the first message', async () => {
  backend({ selection: { projects: { p1: 'theorem.style.formal' } } })
  useShell.setState({ projectId: 'p1' })
  const { container } = await mount()
  expect(trigger(container)?.textContent).toBe('Formal')
  expect(usePendingStyle.getState().styleId).toBeUndefined()

  const items = await open(container)
  await act(() => itemNamed(items, 'Concise').click())
  expect(selectionWrites()).toEqual([])
  expect(usePendingStyle.getState().styleId).toBe('theorem.style.concise')
  await waitFor(() => trigger(container)?.textContent === 'Concise')
  // It waits for the conversation a first message makes; none holds it yet.
  expect(usePendingStyle.getState().held).toEqual({})

  const again = await open(container)
  await act(() => again[0]!.click())
  expect(usePendingStyle.getState().styleId).toBeUndefined()
  await waitFor(() => trigger(container)?.textContent === 'Formal')
  expect(selectionWrites()).toEqual([])
})

test('a pick waiting for a first message that names a style since deleted is dropped', async () => {
  backend({})
  usePendingStyle.setState({ styleId: 'user.style.gone' })
  await mount()
  await waitFor(() => usePendingStyle.getState().styleId === undefined)
})

test('a pick whose first message was refused still shows on its conversation, and choosing again writes it', async () => {
  backend({ selection: { account: 'theorem.style.educational' } })
  // The conversation was made for the message, so Theorem holds no choice for it yet.
  usePendingStyle.setState({
    held: { t1: 'theorem.style.concise', t2: 'theorem.style.formal' },
  })
  const { container } = await mount('t1')
  await waitFor(() => trigger(container)?.textContent === 'Concise')
  const items = await open(container)
  expect(itemNamed(items, 'Concise').getAttribute('aria-checked')).toBe('true')

  await act(() => itemNamed(items, 'Exploratory').click())
  // The choice goes to Theorem now, so nothing is left to ride a message; another conversation's pick stays.
  expect(usePendingStyle.getState().held).toEqual({
    t2: 'theorem.style.formal',
  })
  expect(selectionWrites().map((write) => write.body)).toEqual([
    {
      scope: 'conversation',
      threadId: 't1',
      style: 'theorem.style.exploratory',
    },
  ])
  await waitFor(() => trigger(container)?.textContent === 'Exploratory')
})

test('a conversation with no pick waiting shows what Theorem has for it, whatever another holds', async () => {
  backend({ selection: { account: 'theorem.style.educational' } })
  usePendingStyle.setState({
    styleId: 'theorem.style.formal',
    held: { t2: 'theorem.style.concise' },
  })
  const { container } = await mount('t1')
  expect(trigger(container)?.textContent).toBe('Educational')
})

test('a pick held for a conversation that names a style since deleted is dropped', async () => {
  backend({})
  usePendingStyle.setState({ held: { t1: 'user.style.gone' } })
  await mount('t1')
  await waitFor(() => !('t1' in usePendingStyle.getState().held))
})

test("the project's default is offered inside a project, and sets the style in use", async () => {
  backend({})
  const { container } = await mount('t1')
  const items = await open(container)
  await act(() => itemNamed(items, 'Exploratory').click())
  await waitFor(() => trigger(container)?.textContent === 'Exploratory')

  await open(container)
  await act(() => menuAction("Set as this project's default")!.click())
  expect(selectionWrites().at(-1)?.body).toEqual({
    scope: 'project',
    projectId: 'p1',
    style: 'theorem.style.exploratory',
  })
  await waitFor(() => {
    const [first] = document.querySelectorAll('[role="menuitem"]')
    return first === undefined
  })

  await open(container)
  await waitFor(() =>
    menuAction("Set as this project's default")?.hasAttribute('data-disabled'),
  )
  await act(() => menuAction('Set as my default')!.click())
  expect(selectionWrites().at(-1)?.body).toEqual({
    scope: 'account',
    style: 'theorem.style.exploratory',
  })
})

test('the picker links to the style editor through the router', async () => {
  backend({})
  const { container, router } = await mount('t1')
  await open(container)
  const link = document.querySelector<HTMLAnchorElement>(
    'a[href="/settings/styles"]',
  )
  expect(link?.textContent).toBe('Edit styles…')
  await act(() => link!.click())
  await waitFor(() => router.state.location.pathname === '/settings/styles')
})

test('a choice Theorem refuses is said in words, and the trigger keeps the style in use', async () => {
  backend(
    {},
    {
      'PUT /api/chat/v1/response-styles/selection': () =>
        new Response(
          JSON.stringify({
            title: 'That style no longer exists',
            detail: 'Pick another style.',
            status: 422,
            code: 'response_style_unknown',
          }),
          {
            status: 422,
            headers: { 'content-type': 'application/problem+json' },
          },
        ),
    },
  )
  const { container } = await mount('t1')
  const items = await open(container)
  await act(() => itemNamed(items, 'Concise').click())
  const toast = await waitFor(() =>
    [
      ...document.querySelectorAll(
        '[data-slot="toast-title"], [data-slot="toast-description"]',
      ),
    ].length
      ? document.body
      : undefined,
  )
  expect(toast.textContent).toContain('Could not change the response style')
  expect(toast.textContent).toContain('Pick another style.')
  expect(toast.textContent).not.toContain('response_style_unknown')
  expect(trigger(container)?.textContent).toBe('Default')
})

test('the composer mounts the picker beside the model and effort pickers', async () => {
  backend({})
  const { container } = await render(
    <Runtime threadId="t1">
      <Thread autoFocus={false} />
    </Runtime>,
  )
  const button = await waitFor(() => trigger(container))
  expect(button.textContent).toBe('Default')
})
