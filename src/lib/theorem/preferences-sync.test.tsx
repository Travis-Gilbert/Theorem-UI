// SOURCING: none — tests of the preferences sync against the preferences route served in-process
import { afterAll, afterEach, beforeAll, beforeEach, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { cleanup, render, waitFor } from '../../../test/blocks/render'
import { useGenerationDefaults } from './generation'
import { PreferencesSync, usePickedModels } from './models'

type Put = { ifMatch: string | null; body: Record<string, unknown> }

let stored: Record<string, unknown>
let reads: number
let puts: Put[]
/** A Theorem that answers 422 to a write naming the field. */
let refusesGeneration: boolean
/** A Theorem that takes the write and does not keep the field. */
let dropsGeneration: boolean
let fetchSpy: ReturnType<typeof spyOn>
const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM

beforeAll(() => {
  page.setURL('http://localhost:3000/')
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path.endsWith('/bootstrap')) return Response.json({ csrfToken: 'csrf', tenantId: 't' })
    if (!path.endsWith('/preferences')) return Response.json({}, { status: 404 })
    if (request.method === 'GET') {
      reads += 1
      return Response.json(stored)
    }
    const body = (await request.json()) as Record<string, unknown>
    puts.push({ ifMatch: request.headers.get('If-Match'), body })
    if (refusesGeneration && 'generation' in body)
      return Response.json({ title: 'Unknown field' }, { status: 422 })
    stored = {
      ...stored,
      ...body,
      ...(dropsGeneration ? { generation: undefined } : {}),
      revision: Number(stored.revision) + 1,
    }
    return Response.json(stored)
  }) as typeof fetch)
})
afterAll(() => {
  fetchSpy.mockRestore()
  page.setURL('about:blank')
})
beforeEach(() => {
  stored = { starredModels: [], defaultModel: null, revision: 3 }
  reads = 0
  puts = []
  refusesGeneration = false
  dropsGeneration = false
  useGenerationDefaults.setState({ defaults: {}, onServer: undefined })
  usePickedModels.setState({ selected: undefined, starred: [] })
})
afterEach(async () => {
  await cleanup()
  useGenerationDefaults.setState({ defaults: {}, onServer: undefined })
  usePickedModels.setState({ selected: undefined, starred: [] })
})

/** Mounts the sync and waits until it has read Theorem's copy and taken its revision. */
async function mount() {
  await render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PreferencesSync />
    </QueryClientProvider>,
  )
  await waitFor(() => reads > 0)
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
}

test('defaults Theorem holds replace the ones on this browser when preferences load', async () => {
  stored = { ...stored, generation: { effort: 'high', maxOutputTokens: 4000 } }
  useGenerationDefaults.setState({ defaults: { effort: 'low' } })
  await mount()
  expect(useGenerationDefaults.getState()).toMatchObject({
    defaults: { effort: 'high', maxOutputTokens: 4000 },
    onServer: true,
  })
  // Theorem's own copy is not a change to write back.
  expect(puts).toEqual([])
})

test('a changed default is written back with the models and the revision it was read at', async () => {
  await mount()
  await act(async () => useGenerationDefaults.getState().change({ responseDetail: 'concise', effort: 'max' }))
  await waitFor(() => puts.length === 1)
  expect(puts[0]).toEqual({
    ifMatch: '3',
    body: {
      starredModels: [],
      defaultModel: null,
      generation: { responseDetail: 'concise', effort: 'max' },
    },
  })
  await waitFor(() => useGenerationDefaults.getState().onServer)
})

test('a Theorem that refuses the field still takes the models, and the defaults stay on this browser', async () => {
  refusesGeneration = true
  await mount()
  await act(async () => useGenerationDefaults.getState().change({ maxOutputTokens: 2000 }))
  await waitFor(() => puts.length === 2)
  expect(puts[0]!.body).toHaveProperty('generation')
  expect(puts[1]!.body).toEqual({ starredModels: [], defaultModel: null })
  await waitFor(() => useGenerationDefaults.getState().onServer === false)
  expect(useGenerationDefaults.getState().defaults).toEqual({ maxOutputTokens: 2000 })

  // It is not asked again this session: the next write names only the models.
  await act(async () => usePickedModels.setState({ starred: ['openrouter/a/b'] }))
  await waitFor(() => puts.length === 3)
  expect(puts[2]!.body).toEqual({ starredModels: ['openrouter/a/b'], defaultModel: null })
})

test('a Theorem that takes the write and drops the field is reported as not holding it', async () => {
  dropsGeneration = true
  await mount()
  await act(async () => useGenerationDefaults.getState().change({ effort: 'low' }))
  await waitFor(() => useGenerationDefaults.getState().onServer === false)
  expect(useGenerationDefaults.getState().defaults).toEqual({ effort: 'low' })
})
