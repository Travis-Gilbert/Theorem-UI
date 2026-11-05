import { afterEach, expect, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { ModelPicker } from './model-picker'
import { CommandPalette, useCommandPalette } from '../shell/command-palette'
import { modelListQuery, parseModelList, pickedModelTurnOptions, usePickedModels } from '@/lib/theorem/models'
import { catalogQuery } from '@/lib/theorem/catalog'
import { cleanup, click, render, waitFor } from '../../../test/blocks/render'

const clients: QueryClient[] = []
afterEach(async () => {
  await cleanup()
  clients.splice(0).forEach((client) => client.clear())
  usePickedModels.setState({ selected: undefined, starred: [] })
  useCommandPalette.setState({ open: false })
})

async function models(palette: boolean) {
  const client = new QueryClient()
  clients.push(client)
  client.setQueryData(modelListQuery.queryKey, parseModelList({
    models: [{ ref: 'provider/vendor/available', name: 'Available', context_length: 100000 }],
    defaultError: { code: 'invalid_default', message: 'The configured default is missing.' },
  }))
  client.setQueryData(catalogQuery.queryKey, { plugins: [], skills: [] })
  const route = createRootRoute({ component: () => <QueryClientProvider client={client}>{palette ? <CommandPalette /> : <ModelPicker />}</QueryClientProvider> })
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  return render(<RouterProvider router={router} />)
}

test('picker exposes invalid default and selecting a starred model sends the exact provider/model', async () => {
  usePickedModels.getState().setStarred(['provider/vendor/available'])
  const { container } = await models(false)
  await click(container.querySelector('[aria-label="Model"]')!)
  await waitFor(() => document.querySelector('[role="alert"]'))
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('The configured default is missing.')
  const option = await waitFor(() => [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent.includes('Available')))
  await click(option)
  expect(pickedModelTurnOptions.model).toEqual({ provider: 'provider', model: 'vendor/available' })
  expect(container.textContent).toContain('Available')
})

test('command palette exposes invalid default while keeping available model selection', async () => {
  useCommandPalette.setState({ open: true })
  await models(true)
  await waitFor(() => document.querySelector('[role="alert"]'))
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('invalid_default')
  const option = await waitFor(() => [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent.includes('Available')))
  await click(option)
  expect(pickedModelTurnOptions.model).toEqual({ provider: 'provider', model: 'vendor/available' })
  expect(useCommandPalette.getState().open).toBe(false)
})
