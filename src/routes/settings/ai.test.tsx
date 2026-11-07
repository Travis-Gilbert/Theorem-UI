import { afterEach, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route } from './ai'
import { modelListQuery, parseModelList, usePickedModels } from '@/lib/theorem/models'
import { buttonNamed, cleanup, click, render, waitFor } from '../../../test/blocks/render'

const clients: QueryClient[] = []
afterEach(async () => {
  await cleanup()
  clients.splice(0).forEach((client) => client.clear())
  usePickedModels.setState({ selected: undefined, starred: [] })
})
async function settings(body: unknown) {
  const client = new QueryClient()
  clients.push(client)
  client.setQueryData(modelListQuery.queryKey, parseModelList(body))
  const Component = Route.options.component!
  return render(<QueryClientProvider client={client}><Component /></QueryClientProvider>)
}

test('unknown default does not claim an Inkling model or routing policy', async () => {
  const { container } = await settings({ models: [] })
  expect(container.textContent).not.toContain('Inkling')
  expect(container.textContent).toContain('Theorem has not reported its configured default model.')
})

test('configured default names the actual catalog model without assuming worker policy', async () => {
  const { container } = await settings({ models: [{ ref: 'provider/vendor/custom', name: 'Vendor: Custom' }], defaultRef: 'provider/vendor/custom' })
  expect(container.textContent).toContain('Custom (provider/vendor/custom)')
  expect(container.textContent).not.toContain('mixture of models')
  expect(container.textContent).toContain('Every model powers Theorem')
  expect(container.textContent).toContain('Provider labels identify who supplies the model')
  expect(container.textContent).toContain('Default model')
})

test('invalid configured default shows its safe cause while retaining explicit choices', async () => {
  const { container } = await settings({ models: [{ ref: 'provider/available', name: 'Available' }], defaultError: { code: 'chat_model_not_found', message: 'The configured default is absent. Choose another model.' } })
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('The configured default is absent. Choose another model.')
  expect(container.textContent).not.toContain('chat_model_not_found')
  expect(container.textContent).toContain('Available')
  expect(container.textContent).not.toContain('Inkling')
})


test('a real missing model endpoint shows uncertainty and Retry reloads the catalog', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  clients.push(client)
  const originalUrl = window.location.href
  window.location.href = 'https://theorem.test/'
  let available = false
  const fetch = spyOn(window, 'fetch').mockImplementation(Object.assign(async () => available
    ? Response.json({ models: [{ ref: 'provider/restored', name: 'Restored' }], defaultRef: 'provider/restored' })
    : Response.json({ detail: 'Model listing is not served.' }, { status: 404 }), { preconnect: window.fetch.preconnect }))
  try {
    const Component = Route.options.component!
    const { container } = await render(<QueryClientProvider client={client}><Component /></QueryClientProvider>)
    await waitFor(() => buttonNamed(container, 'Retry model list'))
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not load models')
    expect(container.textContent).not.toContain("Turns run on Theorem's default")
    expect(container.textContent).not.toContain('Inkling')
    available = true
    await click(buttonNamed(container, 'Retry model list')!)
    await waitFor(() => container.textContent.includes('Restored (provider/restored)'))
    expect(container.querySelector('[role="alert"]')).toBeNull()
  } finally {
    fetch.mockRestore()
    window.location.href = originalUrl
  }
})

test('an explicit selection remains selected when the configured default is invalid', async () => {
  usePickedModels.getState().select('provider/available')
  const { container } = await settings({ models: [{ ref: 'provider/available', name: 'Available' }], defaultError: { code: 'invalid_default', message: 'Default is unavailable.' } })
  expect(container.textContent).toContain('Availableprovider/available')
  expect(usePickedModels.getState().selected).toBe('provider/available')
  await click(buttonNamed(container, 'Use the default')!)
  expect(usePickedModels.getState().selected).toBeUndefined()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Default is unavailable.')
})


test('OpenRouter discovery failure keeps configured choices and Retry loads the directory', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  const originalUrl = window.location.href
  window.location.href = 'https://theorem.test/'
  let recovered = false
  const fetch = spyOn(window, 'fetch').mockImplementation(Object.assign(async () => Response.json({
    models: recovered
      ? [{ ref: 'openrouter/deepseek/discovered', name: 'DeepSeek discovered' }]
      : [{ ref: 'openrouter/configured', name: 'Configured' }],
    openrouter: recovered ? { status: 'live' } : { status: 'unavailable', error: 'network_error' },
  }), { preconnect: window.fetch.preconnect }))
  try {
    const Component = Route.options.component!
    const { container } = await render(<QueryClientProvider client={client}><Component /></QueryClientProvider>)
    await waitFor(() => container.textContent.includes('configured models only'))
    expect(container.textContent).toContain('Configured')
    recovered = true
    await click(buttonNamed(container, 'Retry model list')!)
    await waitFor(() => container.textContent.includes('DeepSeek discovered'))
    expect(Boolean(container.querySelector('[role="alert"]'))).toBe(false)
  } finally {
    fetch.mockRestore()
    window.location.href = originalUrl
  }
})
