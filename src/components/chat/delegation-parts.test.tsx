import { afterEach, expect, test } from 'bun:test'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { cleanup, render } from '../../../test/blocks/render'
import type { DelegationPart } from '@/lib/theorem/delegations'
import { DelegationBody } from './delegation-parts'

afterEach(cleanup)

const failure = 'agent_iteration_limit: worker reached its step limit before publishing an App'
function work(problem?: string): DelegationPart {
  return {
    delegationId: 'work-test', parentRunId: 'parent', childRunId: 'child',
    roleId: 'code.implementer', roleLabel: 'App builder', model: 'provider/model',
    state: 'failed', objective: 'Build a durable App', fileScope: [], criteria: [],
    intent: { intentId: 'intent', revision: 1 }, updatedAtMs: 1, problem,
    receipt: {
      terminal: { kind: 'failed', code: 'agent_iteration_limit', message: failure },
      changes: [], checks: [], commandCount: 0, contentHash: 'test-receipt',
      reported: { summary: 'Built a self-contained App in the workspace.', completedCriteria: [], skipped: [], deviations: [], assumptions: [], unresolved: [] },
    },
  }
}

async function view(delegation: DelegationPart) {
  const route = createRootRoute({ component: () => <DelegationBody delegation={delegation} /> })
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  return render(<RouterProvider router={router} />)
}

test('a failed worker shows its authoritative failure before its optimistic report', async () => {
  const { container } = await view(work())
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(failure)
  expect(container.textContent.indexOf(failure)).toBeLessThan(container.textContent.indexOf('Built a self-contained App'))
  expect(container.textContent).toContain('Built a self-contained App')
})

test('worker and interpretation failures both remain visible without duplicate alerts', async () => {
  const first = await view(work('The result could not be interpreted.'))
  expect([...first.container.querySelectorAll('[role="alert"]')].map((node) => node.textContent)).toEqual([
    failure, 'Follow-up failed: The result could not be interpreted.',
  ])
  await cleanup()
  const repeated = await view(work(failure))
  expect(repeated.container.querySelectorAll('[role="alert"]')).toHaveLength(1)
  expect(repeated.container.querySelector('[role="alert"]')?.textContent).toBe(failure)
})

test('completed work does not invent a failure', async () => {
  const completed = work()
  completed.state = 'published'
  completed.receipt!.terminal = { kind: 'completed' }
  const { container } = await view(completed)
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.textContent).toContain('Ready')
})

test('queued work remains visible before a receipt exists', async () => {
  const pending = work()
  pending.state = 'admitted'
  delete pending.receipt
  const { container } = await view(pending)
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.textContent).toContain('Queued')
})

// The worker and the later conversation-lead assessment are separate outcomes.
test('a ready App labels a failed follow-up without declaring the build failed', async () => {
  const completed = work('agent_service_request_rejected: The service rejected the follow-up.')
  completed.state = 'published'
  completed.receipt!.terminal = { kind: 'completed' }
  const { container } = await view(completed)
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'Follow-up failed: agent_service_request_rejected: The service rejected the follow-up.',
  )
  expect(container.textContent).toContain('Ready')
  expect(container.textContent).toContain('Built a self-contained App')
  expect(container.querySelectorAll('[role="alert"]').length).toBe(1)
})
