// SOURCING: bun:test over the rail's Files control and destination order, rendered with React into
// happy-dom inside a memory router with the app's mode routes. fetch is stubbed,
// as no Theorem is running.
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
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
import { Rail, orderModes } from './rail'
import { useShell } from './shell-state'

function renderRail(props: { collapsible?: boolean }) {
  const root = createRootRoute({ component: Outlet })
  const shell = createRoute({
    getParentRoute: () => root,
    id: '_chat',
    component: () => (
      <>
        <Rail {...props} />
        <Outlet />
      </>
    ),
  })
  const routeTree = root.addChildren([
    shell.addChildren(
      ['/', 'vault', 'ide'].map((path) =>
        createRoute({ getParentRoute: () => shell, path }),
      ),
    ),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/vault'] }),
  })
  return { router, rendered: render(<RouterProvider router={router} />) }
}

const click = (button: HTMLButtonElement) => act(async () => button.click())

let restoreFetch: (() => void) | undefined
beforeEach(() => {
  useShell.setState({ filesShown: false, railOrder: [] })
  const spy = spyOn(globalThis, 'fetch').mockImplementation(
    (async () =>
      new Response(null, { status: 404 })) as unknown as typeof fetch,
  )
  restoreFetch = () => spy.mockRestore()
})
afterEach(() => {
  restoreFetch?.()
  cleanup()
})

test("on a phone, Files shows the drawer's files and stays in the mode", async () => {
  const { router, rendered } = renderRail({})
  const { container } = await rendered
  const files = await waitFor(() =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Files"]'),
  )

  await click(files)
  await waitFor(() => files.getAttribute('aria-pressed') === 'true')
  expect(useShell.getState().filesShown).toBe(true)
  expect(router.state.location.pathname).toBe('/vault')

  await click(files)
  await waitFor(() => files.getAttribute('aria-pressed') === 'false')
  expect(useShell.getState().filesShown).toBe(false)
})

test('on the desktop, Files leaves a mode that covers the panel', async () => {
  const { router, rendered } = renderRail({ collapsible: true })
  const { container } = await rendered
  const files = await waitFor(() =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Files"]'),
  )

  await click(files)

  await waitFor(() => router.state.location.pathname === '/')
  expect(useShell.getState().filesShown).toBe(true)
})

test('the rail keeps the order destinations were dragged into', () => {
  const modes = (order: Parameters<typeof orderModes>[0]) =>
    orderModes(order).map((entry) => entry.mode)
  expect(modes([])).toEqual([
    'chat',
    'index',
    'pages',
    'vault',
    'spaces',
    'canvas',
    'ide',
  ])
  // A mode the saved order does not name follows in its default place.
  expect(modes(['ide', 'chat', 'canvas'])).toEqual([
    'ide',
    'chat',
    'canvas',
    'index',
    'pages',
    'vault',
    'spaces',
  ])
})

test('Alt and an arrow move a destination without opening it', async () => {
  const { router, rendered } = renderRail({ collapsible: true })
  const { container } = await rendered
  const ide = await waitFor(() =>
    container.querySelector<HTMLButtonElement>('button[aria-label="IDE"]'),
  )
  const press = (key: string) =>
    act(async () => {
      ide.dispatchEvent(
        new KeyboardEvent('keydown', { key, altKey: true, bubbles: true }),
      )
    })

  await press('ArrowUp')
  await press('ArrowUp')
  const order = useShell.getState().railOrder
  expect(order.slice(-3)).toEqual(['ide', 'spaces', 'canvas'])
  expect(router.state.location.pathname).toBe('/vault')

  const labels = () =>
    [...container.querySelectorAll('nav[aria-label="Modes"] button')].map(
      (button) => button.getAttribute('aria-label'),
    )
  await waitFor(() => labels().indexOf('IDE') === labels().length - 3)
})
