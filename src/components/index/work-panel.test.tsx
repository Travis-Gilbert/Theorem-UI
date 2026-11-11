// SOURCING: bun:test over the Index panel's Work group and the tracker's gate, rendered with React into happy-dom (test/workspace's render) inside a memory router shaped like /_chat/index. window.fetch and EventSource are stand-ins that record what was asked, as no Theorem is running
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { act } from 'react'
import type { ReactNode } from 'react'
import { z } from 'zod/v4'
import { cleanup, render, waitFor } from '../../../test/workspace'
import { SETTINGS, view } from '@/components/work/fixtures'
import { WorkGate } from '@/components/work/gate'
import { useWorkItems } from '@/components/work/queries'
import { IndexPanel } from './index-panel'

const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => page.setURL('http://localhost:3000/'))
afterAll(() => page.setURL('about:blank'))

let tracker: { enabled: boolean; github: boolean }
let requests: string[]
let streams: string[]
const realFetch = window.fetch
const realEventSource = globalThis.EventSource

class FakeEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  readyState = 1
  constructor(url: string) {
    streams.push(url)
  }
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  tracker = { enabled: true, github: true }
  requests = []
  streams = []
  Object.assign(globalThis, { EventSource: FakeEventSource })
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    requests.push(`${method} ${url.pathname}`)
    switch (url.pathname) {
      // A query is a POST, and every write asks for the session's token first.
      case '/api/chat/v1/bootstrap':
        return Response.json({ schema: 'theorem.chat.bootstrap.v1', csrfToken: 'csrf' })
      case '/api/work/v1/settings':
        return Response.json({
          ...SETTINGS,
          enabled: tracker.enabled,
          github: { ...SETTINGS.github, enabled: tracker.github },
        })
      case '/api/work/v1/views':
        return Response.json({
          views: [
            view('inbox', 'Inbox', {}, 'inbox'),
            view('my-issues', 'My issues'),
            view('mine', 'Release blockers', { builtin: false }),
            view('all-issues', 'All issues'),
          ],
        })
      case '/api/work/v1/inbox':
        return Response.json({ entries: [], unreadCount: 4 })
      case '/api/work/v1/items/query':
        return Response.json({ items: [], total: 0 })
    }
    return Response.json({}, { status: 404 })
  }) as typeof fetch
})
afterEach(async () => {
  await cleanup()
  window.fetch = realFetch
  Object.assign(globalThis, { EventSource: realEventSource })
})

const workRequests = () => requests.filter((r) => r.includes('/api/work/'))

/** A memory router with the /index route's id and search schema, so the panel's hooks resolve. */
async function renderAt(initial: string, element: ReactNode) {
  const root = createRootRoute({ component: Outlet })
  const shell = createRoute({ getParentRoute: () => root, id: '_chat', component: Outlet })
  const index = createRoute({
    getParentRoute: () => shell,
    path: 'index',
    validateSearch: z.object({
      view: z.string().optional(),
      item: z.string().optional(),
      collection: z.string().optional(),
    }),
    component: () => element,
  })
  const settings = createRoute({
    getParentRoute: () => root,
    path: 'settings/work',
    component: () => <p>Work settings</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([shell.addChildren([index]), settings]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  })
  await render(<RouterProvider router={router} />)
  return { router }
}

const text = () => document.body.textContent
const button = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('button, a, [role=button]')].find((el) =>
    el.textContent.includes(label),
  )

test('with the tracker on, the panel lists the inbox with its unread count, the views and the projects', async () => {
  const { router } = await renderAt('/index', <IndexPanel />)
  await waitFor(() => text().includes('Release blockers'))
  expect(text()).toContain('Work inbox')
  expect(text()).toContain('Work projects')
  // Shipped views come before the person's own; scope inbox is the inbox row, not a view row.
  const names = [...document.querySelectorAll('nav [role], nav button, nav a')]
    .map((el) => el.textContent)
    .filter((t) => ['My issues', 'All issues', 'Release blockers'].includes(t))
  expect(names).toEqual(['My issues', 'All issues', 'Release blockers'])
  await waitFor(() => text().includes('4'))

  await act(async () => button('My issues')!.click())
  await waitFor(() => router.state.location.search.view === 'default:work:view/my-issues')

  await act(async () => button('Work inbox')!.click())
  await waitFor(() => router.state.location.search.view === 'default:work:inbox')

  await act(async () => button('Work projects')!.click())
  await waitFor(() => router.state.location.search.view === 'default:work:projects')
  expect(streams).toEqual(['/api/work/v1/events'])
})

test('with the tracker off, the Work group is gone and only the settings were asked for', async () => {
  tracker.enabled = false
  await renderAt('/index', <IndexPanel />)
  await waitFor(() => workRequests().includes('GET /api/work/v1/settings'))
  await waitFor(() => text().includes('Everything'))
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(text()).not.toContain('Work inbox')
  expect(text()).not.toContain('Work projects')
  expect(text()).not.toContain('Release blockers')
  expect(new Set(workRequests())).toEqual(new Set(['GET /api/work/v1/settings']))
  expect(streams).toEqual([])
})

test('a direct link to a work screen while the tracker is off shows a short state linking to the setting, and opens nothing', async () => {
  tracker.enabled = false
  function Screen() {
    // Would ask for items the moment it mounted.
    useWorkItems({})
    return <p>The list</p>
  }
  const { router } = await renderAt(
    '/index?view=default:work:view/all-issues',
    <WorkGate>
      <Screen />
    </WorkGate>,
  )
  await waitFor(() => text().includes('Work tracker is off'))
  expect(text()).not.toContain('The list')
  const link = document.querySelector<HTMLAnchorElement>('a[href="/settings/work"]')
  expect(link).not.toBeNull()
  await act(async () => link!.click())
  await waitFor(() => router.state.location.pathname === '/settings/work')
  expect(new Set(workRequests())).toEqual(new Set(['GET /api/work/v1/settings']))
  expect(streams).toEqual([])
})

test('with the tracker on, the gate mounts its children and opens one stream', async () => {
  function Screen() {
    useWorkItems({})
    return <p>The list</p>
  }
  await renderAt(
    '/index',
    <WorkGate>
      <Screen />
    </WorkGate>,
  )
  await waitFor(() => text().includes('The list'))
  await waitFor(() => workRequests().includes('POST /api/work/v1/items/query'))
  expect(streams).toEqual(['/api/work/v1/events'])
})

test('a tracker this Theorem does not serve is off, with a different note', async () => {
  window.fetch = (async () => Response.json({}, { status: 404 })) as unknown as typeof fetch
  await renderAt('/index', <WorkGate>Inside</WorkGate>)
  await waitFor(() => text().includes('does not serve the work tracker'))
  expect(text()).not.toContain('Inside')
  expect(streams).toEqual([])
})
