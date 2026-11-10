import { afterAll, afterEach, beforeAll, beforeEach, expect, mock, spyOn, test } from 'bun:test'
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { theorem } from '@/lib/theorem/client'
import type { Theorem } from '@/lib/theorem/client'
import { useGenerationOverrides } from '@/lib/theorem/generation'
import { Thread } from '../assistant-ui/elements/thread.aui'
import { TheoremPartRenderers } from './theorem-parts'
import { buttonNamed, cleanup, click, render, waitFor } from '../../../test/blocks/render'

const queryClient = new QueryClient()
function Harness({
  messages,
  isRunning = false,
  onNew = async () => {},
}: {
  messages: ThreadMessageLike[]
  isRunning?: boolean
  onNew?: (message: unknown) => Promise<void>
}) {
  const runtime = useExternalStoreRuntime({
    messages, isRunning, onNew,
    convertMessage: (message: ThreadMessageLike) => message,
  })
  return <QueryClientProvider client={queryClient}>
    <AssistantRuntimeProvider runtime={runtime}>
      <TheoremPartRenderers />
      <Thread autoFocus={false} />
    </AssistantRuntimeProvider>
  </QueryClientProvider>
}
afterEach(cleanup)
beforeEach(() => useGenerationOverrides.setState({ byThread: {} }))
// The running turn's thinking indicator splits its label into words, which waits on fonts; happy-dom has none.
beforeAll(() => {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    // The composer's autosize listens for font loads on the same object.
    value: { status: 'loaded', ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} },
  })
})
afterAll(() => Reflect.deleteProperty(document, 'fonts'))

type StoredPart = Theorem.Message['parts'][number]
const search = (id: string, query: string): StoredPart[] => [
  { partId: `${id}-call`, type: 'tool_call', payload: { toolCallId: id, toolName: 'web_search', safeArguments: { query } } },
  { partId: `${id}-result`, type: 'tool_result', payload: { toolCallId: id, status: 'complete', safeOutput: { query, hits: [] } } },
]
const answer = (parts: StoredPart[]) => toAssistantMessages([{
  schema: 'theorem.chat.message.v1', messageId: 'answer', tenantId: 'tenant',
  threadId: 'thread', originBranchId: 'branch', role: 'assistant', createdAtMs: 1,
  parts: [
    { partId: 'progress', type: 'progress', payload: { label: 'Searching the web', status: 'complete' } },
    ...parts,
    { partId: 'text', type: 'text', payload: { text: 'Denver gets 300 days of sun.' } },
  ],
} satisfies Theorem.Message])

test('a finished turn folds its tool calls into its one Done line', async () => {
  const { container } = await render(<Harness messages={answer([...search('s1', 'denver sun'), ...search('s2', 'denver snow')])} />)
  await waitFor(() => container.textContent.includes('Denver gets 300 days of sun.'))
  expect(container.textContent).not.toMatch(/tool calls?/)
  expect(container.querySelector('[data-slot="tool-group-trigger"]')).toBeNull()
  expect(container.querySelectorAll('[data-slot="run-summary"]')).toHaveLength(1)
  expect(container.textContent).not.toContain('Used tool')

  const done = buttonNamed(container, 'Done')
  if (!done) throw new Error('no Done line')
  await click(done)
  await waitFor(() => container.querySelectorAll('[data-slot="tool-fallback-trigger"]').length === 2)
  expect(container.textContent).toContain('Used tool: Web search')
})

test('a running turn shows the work it is on, open, in a line that names it', async () => {
  const working = toAssistantMessages([{
    schema: 'theorem.chat.message.v1', messageId: 'working', tenantId: 'tenant',
    threadId: 'thread', originBranchId: 'branch', role: 'assistant', createdAtMs: 1,
    parts: [
      { partId: 'progress', type: 'progress', payload: { label: 'Searching the web', status: 'running' } },
      { partId: 's1-call', type: 'tool_call', payload: { toolCallId: 's1', toolName: 'web_search', safeArguments: { query: 'denver sun' } } },
    ],
  } satisfies Theorem.Message]).map((message) => ({ ...message, status: { type: 'running' as const } }))
  const { container } = await render(<Harness isRunning messages={working} />)
  const line = await waitFor(() => container.querySelector('[data-slot="run-summary"]'))
  expect(line.textContent).toContain('Searching the web')
  expect(container.textContent).not.toContain('Done')
  await waitFor(() => container.querySelector('[data-slot="tool-fallback-trigger"]'))
})

test('a stretch of work the run has moved on from folds to Done while the prose after it streams', async () => {
  const moved = toAssistantMessages([{
    schema: 'theorem.chat.message.v1', messageId: 'moved', tenantId: 'tenant',
    threadId: 'thread', originBranchId: 'branch', role: 'assistant', createdAtMs: 1,
    parts: [
      { partId: 'progress', type: 'progress', payload: { label: 'Searching the web', status: 'complete' } },
      ...search('s1', 'denver sun'),
      { partId: 't1', type: 'text', payload: { text: 'Denver looks like 300 days.', purpose: 'answer', segment: 1, status: 'running' } },
    ],
  } satisfies Theorem.Message]).map((message) => ({ ...message, status: { type: 'running' as const } }))
  const { container } = await render(<Harness isRunning messages={moved} />)
  await waitFor(() => container.textContent.includes('Denver looks like 300 days.'))
  const lines = container.querySelectorAll('[data-slot="run-summary"]')
  expect(lines).toHaveLength(1)
  expect(lines[0]!.textContent).toBe('Done')
  expect(container.querySelector('[data-slot="tool-fallback-trigger"]')).toBeNull()
})

test('a turn without tool calls keeps a plain Done line that opens nothing', async () => {
  const { container } = await render(<Harness messages={answer([])} />)
  const line = await waitFor(() => container.querySelector('[data-slot="run-summary"]'))
  expect(line.textContent).toBe('Done')
  expect(line.querySelector('button')).toBeNull()
})


/* ---------------------------------------------------- a run as a sequence */

type TextOptions = { purpose?: 'commentary' | 'answer'; segment?: number; status?: 'running' | 'complete' | 'incomplete' }
const prose = (id: string, text: string, options: TextOptions = {}): StoredPart => ({
  partId: id, type: 'text', payload: { text, ...options },
})
const run = (parts: StoredPart[], messageId = 'run') => toAssistantMessages([{
  schema: 'theorem.chat.message.v1', messageId, tenantId: 'tenant',
  threadId: 'thread', originBranchId: 'branch', role: 'assistant', createdAtMs: 1, parts,
} satisfies Theorem.Message])

/** The run's prose segments and stretches of work in the order they stand on the page. */
const sequence = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-slot="prose-segment"], [data-slot="run-summary"]')].map((element) =>
    element.getAttribute('data-slot') === 'run-summary' ? 'steps' : (element.getAttribute('data-purpose') ?? 'answer'),
  )

test('commentary, tool work, commentary, tool work and the answer stand in the order they happened', async () => {
  const { container } = await render(<Harness messages={run([
    prose('t0', 'On it. Looking up Denver.', { purpose: 'commentary', segment: 0, status: 'complete' }),
    ...search('s1', 'denver sun'),
    prose('t1', 'Now Seattle.', { purpose: 'commentary', segment: 1, status: 'complete' }),
    ...search('s2', 'seattle sun'),
    prose('t2', 'Denver gets 300 days of sun.', { purpose: 'answer', segment: 2, status: 'complete' }),
  ])} />)
  await waitFor(() => container.textContent.includes('Denver gets 300 days of sun.'))
  expect(sequence(container)).toEqual(['commentary', 'steps', 'commentary', 'steps', 'answer'])
  const segments = [...container.querySelectorAll('[data-slot="prose-segment"]')]
  expect(segments.map((segment) => segment.className.includes('text-ink-muted'))).toEqual([true, true, false])
  // Each stretch is its own folded line, and the commentary around it is never behind one.
  expect([...container.querySelectorAll('[data-slot="run-summary"]')].map((line) => line.textContent)).toEqual(['Done', 'Done'])
  expect(container.textContent).toContain('On it. Looking up Denver.')
})

test('a run with one answer segment looks as it always has: its prose, with no cut-off note', async () => {
  const { container } = await render(<Harness messages={run([prose('t', 'Denver gets 300 days of sun.')])} />)
  await waitFor(() => container.textContent.includes('Denver gets 300 days of sun.'))
  expect(sequence(container)).toEqual(['answer'])
  expect(container.querySelector('[data-slot="prose-segment"]')!.hasAttribute('data-purpose')).toBe(false)
  expect(container.querySelector('[data-slot="prose-segment"]')!.className).not.toContain('text-ink-muted')
  expect(container.textContent).not.toContain('Cut off')
})

test('a segment that was cut off says so, quietly, and a finished one does not', async () => {
  const { container } = await render(<Harness messages={run([
    prose('t0', 'On it.', { purpose: 'commentary', segment: 0, status: 'complete' }),
    prose('t1', 'Denver gets about 300 days of', { purpose: 'answer', segment: 1, status: 'incomplete' }),
  ])} />)
  await waitFor(() => container.textContent.includes('Denver gets about 300 days of'))
  const notes = [...container.querySelectorAll('[data-slot="prose-segment"]')].map((segment) => segment.textContent.includes('Cut off'))
  expect(notes).toEqual([false, true])
})

test('a segment that settles as commentary keeps its element: only its ink changes', async () => {
  const live = (purpose: 'answer' | 'commentary', status: 'running' | 'complete') => run([
    prose('t0', 'Sure, looking now.', { purpose, segment: 0, status }),
  ]).map((message) => ({ ...message, status: { type: 'running' as const } }))
  const { container, rerender } = await render(<Harness isRunning messages={live('answer', 'running')} />)
  const before = await waitFor(() => container.querySelector('[data-slot="prose-segment"]'))
  expect(before.getAttribute('data-purpose')).toBe('answer')
  await rerender(<Harness isRunning messages={live('commentary', 'complete')} />)
  const after = container.querySelector('[data-slot="prose-segment"]')
  expect(after).toBe(before)
  expect(after!.getAttribute('data-purpose')).toBe('commentary')
})

test('delegated work sits in the stretch of work where it happened, and its result is not the answer', async () => {
  const delegation = {
    delegationId: 'work', parentRunId: 'run', childRunId: 'child', roleId: 'research.reader',
    roleLabel: 'Climate reader', model: 'test/model', state: 'published' as const,
    objective: 'Read the NOAA normals and report the cloudy-day counts.',
    fileScope: [], criteria: [], intent: { intentId: 'intent', revision: 1 }, updatedAtMs: 10,
    receipt: {
      terminal: { kind: 'completed' }, changes: [], checks: [], commandCount: 0, contentHash: 'x',
      reported: { summary: 'Seattle averages 226 cloudy days.', completedCriteria: [], skipped: [], deviations: [], assumptions: [], unresolved: [] },
    },
  }
  const polled = spyOn(theorem().chat.runs, 'delegations').mockResolvedValue({ runId: 'run', delegations: [delegation] } as never)
  try {
    const { container } = await render(<Harness messages={run([
      prose('t0', 'I will have a reader check the climate normals.', { purpose: 'commentary', segment: 0, status: 'complete' }),
      { partId: 'work', type: 'delegation', payload: delegation },
      prose('t1', 'Denver is the sunnier of the two.', { purpose: 'answer', segment: 1, status: 'complete' }),
    ])} />)
    await waitFor(() => container.textContent.includes('Denver is the sunnier of the two.'))
    expect(sequence(container)).toEqual(['commentary', 'steps', 'answer'])
    // The assignment is inside the stretch's group, which opens to it.
    const line = container.querySelector('[data-slot="run-summary"]')!
    await click(buttonNamed(line, 'Done')!)
    await waitFor(() => line.textContent.includes('Climate reader'))
    // Neither the assignment nor its reported result is prose of the run.
    for (const segment of container.querySelectorAll('[data-slot="prose-segment"]'))
      expect(segment.textContent).not.toMatch(/NOAA|226 cloudy/)
  } finally {
    polled.mockRestore()
  }
})

/* ------------------------------------------------------- the run's footer */

const limits = (over: Record<string, unknown> = {}) => ({
  maxOutputTokensPerCall: { value: 8000, source: 'default' },
  modelMaxOutputTokens: 64000,
  runBudget: { maxOutputTokens: null, usedOutputTokens: 1840, maxSteps: null, usedSteps: 3 },
  effort: { requested: 'max', source: 'preference', effective: 'high', reason: 'nearest' },
  responseDetail: { value: 'balanced', source: 'conversation' },
  ...over,
})
const timing = { acceptedAtMs: 1000, firstProviderContentAtMs: 1700, firstPartPersistedAtMs: 1800, completedAtMs: 4500 }
const stopped = (stopReason: string, completion: Record<string, unknown> = {}) => run([
  prose('t', 'Denver gets about 300 days of', { purpose: 'answer', segment: 0, status: 'incomplete' }),
  { partId: 'run:completion', type: 'completion', payload: { stopReason, limits: limits(), timing, ...completion } },
])
const footer = (container: HTMLElement) => container.querySelector('[data-slot="run-footer"]')

test('a run that ended, was stopped or failed draws no footer', async () => {
  for (const reason of ['end_turn', 'cancelled', 'error']) {
    const { container } = await render(<Harness messages={stopped(reason)} />)
    await waitFor(() => container.textContent.includes('Denver gets about 300 days of'))
    expect(footer(container)).toBeNull()
    await cleanup()
  }
})

test('a run that reached its per-call limit says so plainly and offers to continue or raise the limit', async () => {
  const onNew = mock(async (_message: unknown) => {})
  const { container } = await render(<Harness messages={stopped('max_output_tokens')} onNew={onNew} />)
  const line = await waitFor(() => footer(container))
  expect(line.textContent).toContain('reached its limit of 8,000 tokens for one step')
  expect(line.querySelector('[role="alert"]')).toBeNull()

  await click(buttonNamed(line, 'Continue')!)
  expect(onNew).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(onNew.mock.calls[0])).toContain('Continue')

  await click(buttonNamed(line, /Raise to 16,000 tokens/)!)
  expect(useGenerationOverrides.getState().byThread['']).toEqual({ maxOutputTokens: 16000 })
  expect(line.textContent).toContain('Raised for this conversation')
})

test('a run that used its output budget offers to double the budget for the conversation', async () => {
  const exhausted = limits({ runBudget: { maxOutputTokens: 4000, usedOutputTokens: 4000, maxSteps: null, usedSteps: 2 } })
  const { container } = await render(<Harness messages={stopped('run_budget', { limits: exhausted })} />)
  const line = await waitFor(() => footer(container))
  expect(line.textContent).toContain('used its budget of 4,000 tokens')
  await click(buttonNamed(line, /Raise to 8,000 tokens/)!)
  expect(useGenerationOverrides.getState().byThread['']).toEqual({ runBudget: { maxOutputTokens: 8000 } })
})

test('a run that reached its step limit offers to continue or to double the steps for the conversation', async () => {
  const capped = limits({ runBudget: { maxOutputTokens: null, usedOutputTokens: 900, maxSteps: 3, maxStepsSource: 'conversation', usedSteps: 3 } })
  const { container } = await render(<Harness messages={stopped('step_limit', { limits: capped })} />)
  const line = await waitFor(() => footer(container))
  expect(line.textContent).toContain('reached its limit of 3 steps')
  expect(buttonNamed(line, 'Continue')).toBeTruthy()
  await click(buttonNamed(line, /Raise to 6 steps/)!)
  expect(useGenerationOverrides.getState().byThread['']).toEqual({ runBudget: { maxSteps: 6 } })
})

test('only the newest run offers to continue; an older one just says why it stopped', async () => {
  const earlier = stopped('max_output_tokens').map((message) => ({ ...message, id: 'earlier' }))
  const later = run([prose('t2', 'Thanks.')], 'later')
  const { container } = await render(<Harness messages={[...earlier, ...later]} />)
  const line = await waitFor(() => footer(container))
  expect(line.textContent).toContain('reached its limit')
  expect(buttonNamed(line, 'Continue')).toBeUndefined()
})

test('the limits popover opens from the footer with the limits and the run timing', async () => {
  const { container } = await render(<Harness messages={stopped('max_output_tokens')} />)
  const line = await waitFor(() => footer(container))
  await click(buttonNamed(line, 'Limits')!)
  const panel = await waitFor(() => document.querySelector('[data-slot="limits-panel"]'))
  expect(panel.textContent).toContain("Theorem's default")
  expect(panel.textContent).toContain('High')
  expect(panel.textContent).toContain('the nearest level this model lists to Max')
  expect(panel.textContent).toContain('set for this conversation')
  expect(panel.textContent).toContain('Timing')
  expect(panel.textContent).toContain('700 ms')
  expect(panel.textContent).toContain('3.5 s')
})

test('a footer for a run that reported no limits has no limits button', async () => {
  const { container } = await render(<Harness messages={stopped('step_limit', { limits: undefined, timing: undefined })} />)
  const line = await waitFor(() => footer(container))
  expect(buttonNamed(line, 'Limits')).toBeUndefined()
})
