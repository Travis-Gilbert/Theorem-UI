import { afterEach, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '../../../test/blocks/render'
import { plainObjective, useLiveDelegation } from './delegations'
import { theorem } from './client'
import { act } from 'react'
import type { DelegationPart } from './delegations'

const clients: QueryClient[] = []
afterEach(async () => {
  await cleanup()
  for (const client of clients.splice(0)) client.clear()
})

function record(
  state: DelegationPart['state'],
  updatedAtMs: number,
): DelegationPart {
  return {
    delegationId: 'work',
    parentRunId: 'parent',
    childRunId: 'child',
    roleId: 'research.analyst',
    roleLabel: 'Researcher',
    model: 'test/model',
    state,
    objective: 'Compare sources',
    fileScope: [],
    criteria: [],
    intent: { intentId: 'intent', revision: 1 },
    updatedAtMs,
  }
}

function Status({ seed }: { seed: DelegationPart | undefined }) {
  return <output>{useLiveDelegation(seed)?.state}</output>
}

async function view(cached: DelegationPart, seed: DelegationPart | undefined) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  clients.push(client)
  client.setQueryData(['theorem', 'delegations', 'parent'], {
    delegations: [cached],
  })
  return render(
    <QueryClientProvider client={client}>
      <Status seed={seed} />
    </QueryClientProvider>,
  )
}

test('a newer durable transcript update replaces a cached terminal work card', async () => {
  const { container } = await view(
    record('published', 10),
    record('reviewed', 20),
  )
  expect(container.textContent).toBe('reviewed')
})

test('a newer polled work result remains visible over its original transcript seed', async () => {
  const { container } = await view(
    record('published', 20),
    record('admitted', 10),
  )
  expect(container.textContent).toBe('published')
})

test('a published result continues polling until the front has discussed it', async () => {
  const request = spyOn(theorem().chat.runs, 'delegations').mockResolvedValue({
    runId: 'parent',
    delegations: [record('reviewed', 20)],
  })
  try {
    const { container } = await view(
      record('published', 10),
      record('published', 10),
    )
    await waitFor(() => container.textContent === 'reviewed', 4000)
    expect(request).toHaveBeenCalledTimes(1)
  } finally {
    request.mockRestore()
  }
})

test('a failed interpretation remains visible without indefinitely polling the completed result', async () => {
  const failed = {
    ...record('published', 20),
    problem: 'Interpretation model unavailable',
  }
  const request = spyOn(theorem().chat.runs, 'delegations').mockResolvedValue({
    runId: 'parent',
    delegations: [failed],
  })
  try {
    const { container } = await view(failed, failed)
    await act(() => new Promise((resolve) => setTimeout(resolve, 2100)))
    expect(container.textContent).toBe('published')
    expect(request).not.toHaveBeenCalled()
  } finally {
    request.mockRestore()
  }
})

test('equal timestamps retain the latest polled observation', async () => {
  const { container } = await view(
    record('reviewed', 20),
    record('published', 20),
  )
  expect(container.textContent).toBe('reviewed')
})

test('a discussed result stops polling and a missing card stays disabled', async () => {
  const request = spyOn(theorem().chat.runs, 'delegations').mockResolvedValue({
    runId: 'parent',
    delegations: [record('reviewed', 20)],
  })
  try {
    const reviewed = await view(record('reviewed', 20), record('reviewed', 20))
    const absent = await view(record('reviewed', 20), undefined)
    await act(() => new Promise((resolve) => setTimeout(resolve, 2100)))
    expect(reviewed.container.textContent).toBe('reviewed')
    expect(absent.container.textContent).toBe('')
    expect(request).not.toHaveBeenCalled()
  } finally {
    request.mockRestore()
  }
})

test('a newly streamed work card remains visible while its first status request loads', async () => {
  const originalUrl = window.location.href
  window.location.href = 'https://theorem.test/'
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const fetchReply = Object.assign(
    async () => {
      await pending
      return Response.json({
        runId: 'parent',
        delegations: [record('published', 20)],
      })
    },
    { preconnect: window.fetch.preconnect },
  )
  const request = spyOn(window, 'fetch').mockImplementation(fetchReply)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  clients.push(client)
  try {
    const { container } = await render(
      <QueryClientProvider client={client}>
        <Status seed={record('admitted', 10)} />
      </QueryClientProvider>,
    )
    expect(container.textContent).toBe('admitted')
    await act(async () => release())
    await waitFor(
      () =>
        container.textContent === 'published' ||
        client.getQueryState(['theorem', 'delegations', 'parent'])?.error,
    )
    expect(
      client.getQueryState(['theorem', 'delegations', 'parent'])?.error,
    ).toBeNull()
    expect(container.textContent).toBe('published')
  } finally {
    request.mockRestore()
    window.location.href = originalUrl
  }
})

test('an objective drops the object ids the front role wrote for the worker', () => {
  expect(plainObjective('Revise the note (documentId note:8183258f7f2db3a1c9e0) for clarity.')).toBe(
    'Revise the note for clarity.',
  )
  expect(plainObjective('Fix run 0b9d2f8e-6c1a-4f3e-9a7b-2c4d6e8f0a1b before release')).toBe(
    'Fix run before release',
  )
  expect(plainObjective('Compare (the two) sources')).toBe('Compare (the two) sources')
})
