// SOURCING: none — tests of the run's completion footer (chat/run-footer) rendered through the Thread, in the harness activity.test uses
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  mock,
  test,
} from 'bun:test'
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import type { ThreadMessageLike } from '@assistant-ui/react'
import type { Theorem } from '@/lib/theorem/client'
import { useGenerationOverrides } from '@/lib/theorem/generation'
import { Thread } from '../assistant-ui/elements/thread.aui'
import { TheoremPartRenderers } from './theorem-parts'
import {
  buttonNamed,
  cleanup,
  click,
  render,
  waitFor,
} from '../../../test/blocks/render'

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
    messages,
    isRunning,
    onNew,
    convertMessage: (message: ThreadMessageLike) => message,
  })
  return (
    <QueryClientProvider client={queryClient}>
      <AssistantRuntimeProvider runtime={runtime}>
        <TheoremPartRenderers />
        <Thread autoFocus={false} />
      </AssistantRuntimeProvider>
    </QueryClientProvider>
  )
}
afterEach(cleanup)
beforeEach(() => useGenerationOverrides.setState({ byThread: {}, unsaved: {} }))
// The running turn's thinking indicator splits its label into words, which waits on fonts; happy-dom has none.
beforeAll(() => {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    // The composer's autosize listens for font loads on the same object.
    value: {
      status: 'loaded',
      ready: Promise.resolve(),
      addEventListener() {},
      removeEventListener() {},
    },
  })
})
afterAll(() => Reflect.deleteProperty(document, 'fonts'))

type StoredPart = Theorem.Message['parts'][number]
const run = (parts: StoredPart[], messageId = 'run') =>
  toAssistantMessages([
    {
      schema: 'theorem.chat.message.v1',
      messageId,
      tenantId: 'tenant',
      threadId: 'thread',
      originBranchId: 'branch',
      role: 'assistant',
      createdAtMs: 1,
      parts,
    } satisfies Theorem.Message,
  ])

const limits = (over: Record<string, unknown> = {}) => ({
  maxOutputTokensPerCall: { value: 8000, source: 'default' },
  modelMaxOutputTokens: 64000,
  runBudget: {
    maxOutputTokens: null,
    usedOutputTokens: 1840,
    maxSteps: null,
    usedSteps: 3,
  },
  effort: {
    requested: 'max',
    source: 'preference',
    effective: 'high',
    reason: 'nearest',
  },
  responseDetail: { value: 'balanced', source: 'conversation' },
  ...over,
})
const timing = {
  acceptedAtMs: 1000,
  firstProviderContentAtMs: 1700,
  firstPartPersistedAtMs: 1800,
  completedAtMs: 4500,
}
const stopped = (
  stopReason: string,
  completion: Record<string, unknown> = {},
) =>
  run([
    {
      partId: 't',
      type: 'text',
      payload: { text: 'Denver gets about 300 days of' },
    },
    {
      partId: 'run:completion',
      type: 'completion',
      payload: { stopReason, limits: limits(), timing, ...completion },
    },
  ])
const footer = (container: HTMLElement) =>
  container.querySelector('[data-slot="run-footer"]')

test('a run that ended, was stopped or failed draws no footer', async () => {
  for (const reason of ['end_turn', 'cancelled', 'error']) {
    const { container } = await render(<Harness messages={stopped(reason)} />)
    await waitFor(() =>
      container.textContent.includes('Denver gets about 300 days of'),
    )
    expect(footer(container)).toBeNull()
    await cleanup()
  }
})

test('a run that reached its per-call limit says so plainly and offers to continue or raise the limit', async () => {
  const onNew = mock(async (_message: unknown) => {})
  const { container } = await render(
    <Harness messages={stopped('max_output_tokens')} onNew={onNew} />,
  )
  const line = await waitFor(() => footer(container))
  expect(line.textContent).toContain(
    'reached its limit of 8,000 tokens for one step',
  )
  expect(line.querySelector('[role="alert"]')).toBeNull()

  await click(buttonNamed(line, 'Continue')!)
  expect(onNew).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(onNew.mock.calls[0])).toContain('Continue')

  await click(buttonNamed(line, /Raise to 16,000 tokens/)!)
  expect(useGenerationOverrides.getState().byThread['']).toEqual({
    maxOutputTokens: 16000,
  })
  expect(line.textContent).toContain('Raised for this conversation')
})

test('a run that used its output budget offers to double the budget for the conversation', async () => {
  const exhausted = limits({
    runBudget: {
      maxOutputTokens: 4000,
      usedOutputTokens: 4000,
      maxSteps: null,
      usedSteps: 2,
    },
  })
  const { container } = await render(
    <Harness messages={stopped('run_budget', { limits: exhausted })} />,
  )
  const line = await waitFor(() => footer(container))
  expect(line.textContent).toContain('used its budget of 4,000 tokens')
  await click(buttonNamed(line, /Raise to 8,000 tokens/)!)
  expect(useGenerationOverrides.getState().byThread['']).toEqual({
    runBudget: { maxOutputTokens: 8000 },
  })
})

test('a run that reached its step limit offers to continue or to double the steps for the conversation', async () => {
  const capped = limits({
    runBudget: {
      maxOutputTokens: null,
      usedOutputTokens: 900,
      maxSteps: 3,
      maxStepsSource: 'conversation',
      usedSteps: 3,
    },
  })
  const { container } = await render(
    <Harness messages={stopped('step_limit', { limits: capped })} />,
  )
  const line = await waitFor(() => footer(container))
  expect(line.textContent).toContain('reached its limit of 3 steps')
  expect(buttonNamed(line, 'Continue')).toBeTruthy()
  await click(buttonNamed(line, /Raise to 6 steps/)!)
  expect(useGenerationOverrides.getState().byThread['']).toEqual({
    runBudget: { maxSteps: 6 },
  })
})

test('only the newest run offers to continue; an older one just says why it stopped', async () => {
  const earlier = stopped('max_output_tokens').map((message) => ({
    ...message,
    id: 'earlier',
  }))
  const later = run(
    [{ partId: 't2', type: 'text', payload: { text: 'Thanks.' } }],
    'later',
  )
  const { container } = await render(
    <Harness messages={[...earlier, ...later]} />,
  )
  const line = await waitFor(() => footer(container))
  expect(line.textContent).toContain('reached its limit')
  expect(buttonNamed(line, 'Continue')).toBeUndefined()
})

test('the limits popover opens from the footer with the limits and the run timing', async () => {
  const { container } = await render(
    <Harness messages={stopped('max_output_tokens')} />,
  )
  const line = await waitFor(() => footer(container))
  await click(buttonNamed(line, 'Limits')!)
  const panel = await waitFor(() =>
    document.querySelector('[data-slot="limits-panel"]'),
  )
  expect(panel.textContent).toContain("Theorem's default")
  expect(panel.textContent).toContain('High')
  expect(panel.textContent).toContain(
    'the nearest level this model lists to Max',
  )
  expect(panel.textContent).toContain('set for this conversation')
  expect(panel.textContent).toContain('Timing')
  expect(panel.textContent).toContain('700 ms')
  expect(panel.textContent).toContain('3.5 s')
})

test('a footer for a run that reported no limits has no limits button', async () => {
  const { container } = await render(
    <Harness
      messages={stopped('step_limit', { limits: undefined, timing: undefined })}
    />,
  )
  const line = await waitFor(() => footer(container))
  expect(buttonNamed(line, 'Limits')).toBeUndefined()
})
