import { afterEach, expect, test } from 'bun:test'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { cleanup, render } from '../../../test/blocks/render'
import type { DelegationPart } from '@/lib/theorem/delegations'
import { DelegationBody } from './delegation-parts'

afterEach(cleanup)

const failure = 'agent_iteration_limit: worker reached its step limit before publishing an App'
// The machine code the backend leads with stays out of the card.
const shown = 'Worker reached its step limit before publishing an App'
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

async function view(delegation: DelegationPart, detailed = false) {
  const route = createRootRoute({ component: () => <DelegationBody delegation={delegation} detailed={detailed} /> })
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  return render(<RouterProvider router={router} />)
}

test('a failed worker shows its authoritative failure before its optimistic report', async () => {
  const { container } = await view(work())
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(shown)
  expect(container.textContent).not.toContain('agent_iteration_limit')
  expect(container.textContent.indexOf(shown)).toBeLessThan(container.textContent.indexOf('Built a self-contained App'))
  expect(container.textContent).toContain('Built a self-contained App')
})

test('worker and interpretation failures both remain visible without duplicate alerts', async () => {
  const first = await view(work('The result could not be interpreted.'))
  expect([...first.container.querySelectorAll('[role="alert"]')].map((node) => node.textContent)).toEqual([
    shown, 'Follow-up failed: The result could not be interpreted.',
  ])
  await cleanup()
  const repeated = await view(work(failure))
  expect(repeated.container.querySelectorAll('[role="alert"]')).toHaveLength(1)
  expect(repeated.container.querySelector('[role="alert"]')?.textContent).toBe(shown)
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
    'Follow-up failed: The service rejected the follow-up.',
  )
  expect(container.textContent).toContain('Ready')
  expect(container.textContent).toContain('Built a self-contained App')
  expect(container.querySelectorAll('[role="alert"]').length).toBe(1)
})

test('the card in the conversation keeps backend bookkeeping out of sight', async () => {
  const done = work()
  done.state = 'published'
  done.model = 'openrouter/minimax/minimax-m3'
  done.objective = 'Build a habit tracker App (documentId note:8183258f7f2db3a1c9e0) and keep it offline.'
  done.criteria = ['Build a habit tracker App (documentId note:8183258f7f2db3a1c9e0) and keep it offline.', 'Works offline']
  done.receipt!.terminal = { kind: 'completed' }
  done.receipt!.usage = { promptTokens: 15_000, completionTokens: 976 }
  done.receipt!.changes = [{ path: 'app.html', change: 'add', binary: false, admission: { state: 'admitted' } }]
  const { container } = await view(done)
  const text = container.textContent
  expect(text).toContain('Build a habit tracker App and keep it offline.')
  expect(text).not.toContain('documentId')
  expect(text).not.toContain('8183258f')
  expect(text).not.toContain('minimax-m3')
  expect(text).not.toContain('tokens')
  expect(text).not.toContain('commands')
  expect(text).not.toContain('Admitted')
  expect(text).toContain('Works offline')
  // The criterion that only restates the objective is dropped.
  expect(text.split('habit tracker').length).toBe(2)
})

test('the dock panel keeps the run details the card leaves out', async () => {
  const done = work()
  done.state = 'published'
  done.model = 'openrouter/minimax/minimax-m3'
  done.receipt!.terminal = { kind: 'completed' }
  done.receipt!.usage = { promptTokens: 15_000, completionTokens: 976 }
  const { container } = await view(done, true)
  expect(container.textContent).toContain('minimax-m3')
  expect(container.textContent).toContain('15,976 tokens')
})

test('a reviewed delegation without a verdict reads as reviewed', async () => {
  const reviewed = work()
  reviewed.state = 'reviewed'
  reviewed.receipt!.terminal = { kind: 'completed' }
  const { container } = await view(reviewed)
  expect(container.textContent).toContain('Reviewed')
  expect(container.textContent).not.toContain('Discussed')
})
