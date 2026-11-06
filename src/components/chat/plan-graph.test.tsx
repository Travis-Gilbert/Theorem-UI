// SOURCING: bun:test over the plan card, rendered with React into happy-dom under React Flow's own test shim (test/layout), with Theorem's /graphql answered in-process
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { mockLayout } from '../../../test/layout'
import { cleanup, click, render, waitFor } from '../../../test/blocks/render'
import { PlanGraph, PlanToolCall } from './plan-graph'
import type { PlanView } from '@/lib/theorem/plans'

const page = (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM
let unmockLayout: () => void
const realFetch = window.fetch
beforeAll(() => {
  page.setURL('http://localhost:3000/')
  unmockLayout = mockLayout()
  // The thinking indicator splits its label into words, which waits on fonts; happy-dom has none.
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { status: 'loaded', ready: Promise.resolve() },
  })
})
afterAll(() => {
  page.setURL('about:blank')
  unmockLayout()
  Reflect.deleteProperty(document, 'fonts')
})
afterEach(async () => {
  await cleanup()
  window.fetch = realFetch
})

const VIEW: PlanView = {
  planId: 'plan:1',
  title: 'Move to Denver',
  objective: 'Live in Denver by March',
  tasks: [
    { id: 'find-flat', alias: 'find-flat', title: 'Find a flat', goal: 'A signed lease', acceptanceCriteria: ['Lease signed'], dependencies: [] },
    { id: 'book-movers', alias: 'book-movers', title: 'Book movers', acceptanceCriteria: [], dependencies: ['find-flat'] },
  ],
}

const node = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('.react-flow__node')].find((element) =>
    element.getAttribute('aria-label')?.startsWith(label),
  )

test('a plan draws each task as a node, with its state, and an edge for each dependency', async () => {
  await render(<PlanGraph view={VIEW} />)
  await waitFor(() => node('Book movers'))
  expect(node('Find a flat')?.getAttribute('aria-label')).toBe('Find a flat, Ready')
  expect(node('Book movers')?.getAttribute('aria-label')).toBe('Book movers, Waiting')
  await waitFor(() => document.querySelector('.react-flow__edge'))
  expect(document.querySelectorAll('.react-flow__edge')).toHaveLength(1)
  expect(document.body.textContent).toContain('0 of 2 done')
})

test('selecting a task shows its detail, and its neighbours select from there', async () => {
  await render(<PlanGraph view={VIEW} />)
  await click(await waitFor(() => node('Book movers')))
  const detail = await waitFor(() => document.querySelector('section[aria-label="Book movers"]'))
  expect(detail.textContent).toContain('Waits on')
  const neighbour = [...detail.querySelectorAll('button')].find((button) => button.textContent === 'Find a flat')!
  await click(neighbour)
  const next = await waitFor(() => document.querySelector('section[aria-label="Find a flat"]'))
  expect(next.textContent).toContain('A signed lease')
  expect(next.textContent).toContain('Lease signed')
  expect(next.textContent).toContain('Unblocks')
})

const call = (overrides: Partial<ToolCallMessagePartProps>) =>
  ({
    type: 'tool-call',
    toolCallId: 'call-1',
    toolName: 'draft_plan',
    argsText: '',
    args: {
      title: 'Move to Denver',
      objective: 'Live in Denver by March',
      tasks: [
        { alias: 'find-flat', title: 'Find a flat' },
        { alias: 'book-movers', title: 'Book movers', dependencies: ['find-flat'] },
      ],
    },
    status: { type: 'complete' },
    addResult: () => {},
    resume: () => {},
    ...overrides,
  }) as unknown as ToolCallMessagePartProps

test("a written plan reads Theorem's copy, so its tasks show their live status", async () => {
  const asked: unknown[] = []
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    if (new URL(request.url).pathname !== '/graphql') return Response.json({}, { status: 404 })
    asked.push(await request.json())
    return Response.json({
      data: {
        plan: {
          planId: 'plan:1',
          reason: null,
          plan: { title: 'Move to Denver', objective: 'Live in Denver by March', status: 'active' },
          tasks: [
            { id: 't1', alias: 'find-flat', title: 'Find a flat', goal: '', description: '', acceptanceCriteria: [], status: 'done', dependencies: [] },
            { id: 't2', alias: 'book-movers', title: 'Book movers', goal: '', description: '', acceptanceCriteria: [], status: 'pending', dependencies: ['t1'] },
          ],
        },
      },
    })
  }) as typeof fetch
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Call = PlanToolCall
  await render(
    <QueryClientProvider client={client}>
      <Call {...call({ result: { planId: 'plan:1', title: 'Move to Denver', tasks: [] } })} />
    </QueryClientProvider>,
  )
  await waitFor(() => node('Find a flat')?.getAttribute('aria-label') === 'Find a flat, Done')
  expect(node('Book movers')?.getAttribute('aria-label')).toBe('Book movers, Ready')
  expect(document.body.textContent).toContain('1 of 2 done')
  expect(asked[0]).toMatchObject({ variables: { planId: 'plan:1' } })
  client.clear()
})

test('while the model writes the plan, the call is a pending line', async () => {
  const Call = PlanToolCall
  await render(<Call {...call({ status: { type: 'running' } })} />)
  expect(document.body.textContent).toContain('Drafting a plan: Move to Denver')
  expect(document.querySelector('.react-flow')).toBeNull()
})
