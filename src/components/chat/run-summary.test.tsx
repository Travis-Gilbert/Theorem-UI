import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test'
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import type { ThreadMessageLike } from '@assistant-ui/react'
import type { Theorem } from '@/lib/theorem/client'
import { Thread } from '../assistant-ui/elements/thread.aui'
import { TheoremPartRenderers } from './theorem-parts'
import { buttonNamed, cleanup, click, render, waitFor } from '../../../test/blocks/render'

const queryClient = new QueryClient()
function Harness({ messages, isRunning = false }: { messages: ThreadMessageLike[]; isRunning?: boolean }) {
  const runtime = useExternalStoreRuntime({
    messages, isRunning, onNew: async () => {},
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

test('a running turn shows no tool rows, only what it is doing', async () => {
  const running = answer(search('s1', 'denver sun')).map((message) => ({ ...message, status: { type: 'running' as const } }))
  const { container } = await render(<Harness isRunning messages={running} />)
  await waitFor(() => container.textContent.includes('Denver gets 300 days of sun.'))
  expect(container.querySelector('[data-slot="run-summary"]')).toBeNull()
  expect(container.querySelector('[data-slot="tool-fallback-trigger"]')).toBeNull()
  expect(container.textContent).not.toMatch(/tool calls?/)
})

test('a turn without tool calls keeps a plain Done line that opens nothing', async () => {
  const { container } = await render(<Harness messages={answer([])} />)
  const line = await waitFor(() => container.querySelector('[data-slot="run-summary"]'))
  expect(line.textContent).toBe('Done')
  expect(line.querySelector('button')).toBeNull()
})
