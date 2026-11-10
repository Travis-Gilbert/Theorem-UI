// SOURCING: bun:test over the work inbox, rendered with React into happy-dom (test/workspace's render) inside a memory router that has the conversation route, against a fake WorkSource
import { afterEach, expect, test } from 'bun:test'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { act } from 'react'
import { cleanup, render, waitFor } from '../../../test/workspace'
import { entry, fakeSource } from './fixtures'
import { WorkInbox } from './inbox'
import { WorkSourceProvider } from './source'
import type { InboxEntry } from './contract'

afterEach(cleanup)

/** The inbox at `/`, with `/c/$threadId` to go to, and what its rows opened. */
async function renderInbox(entries: InboxEntry[]) {
  const opened: string[] = []
  const source = fakeSource({
    listInbox: async () => ({ entries, unreadCount: entries.length }),
    actOnInbox: async (id) => entries.find((e) => e.id === id) ?? entry(id),
  })
  const root = createRootRoute({ component: Outlet })
  const inbox = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <WorkSourceProvider source={source}>
        <WorkInbox onOpen={(itemId) => opened.push(itemId)} />
      </WorkSourceProvider>
    ),
  })
  const thread = createRoute({
    getParentRoute: () => root,
    path: 'c/$threadId',
    component: () => <p>A conversation</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([inbox, thread]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await render(<RouterProvider router={router} />)
  return { router, opened }
}

const links = () => [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/c/"]')]

test('an entry whose event started a conversation links to it, and one that started none does not', async () => {
  const { router, opened } = await renderInbox([
    entry('n1', {
      reason: 'investigation',
      summary: 'CI failed on main',
      threadId: 'thread-9',
      runId: 'run-9',
    }),
    entry('n2', { reason: 'investigation', summary: 'CI failed on main. No agent run was started.' }),
  ])
  await waitFor(() => document.body.textContent.includes('No agent run was started'))

  expect(links().map((a) => a.getAttribute('href'))).toEqual(['/c/thread-9'])

  await act(async () => links()[0]?.click())
  await waitFor(() => router.state.location.pathname === '/c/thread-9')
  // The link opens the conversation only; the row did not also open its item.
  expect(opened).toEqual([])
})
