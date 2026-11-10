import { afterAll, afterEach, beforeAll, expect, setSystemTime, test } from 'bun:test'
import { AssistantRuntimeProvider, useExternalStoreRuntime, useLocalRuntime } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import type { ChatModelAdapter, ThreadAssistantMessagePart, ThreadMessageLike, ThreadRuntime } from '@assistant-ui/react'
import { act, useEffect } from 'react'
import type { Theorem } from '@/lib/theorem/client'
import { Thread } from '../assistant-ui/elements/thread.aui'
import { timed } from '@/lib/theorem/runtime'
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
/** A thread that runs its turns live, as the app's does; `started` hands back the thread to send on. */
function LiveHarness({ adapter, started }: { adapter: ChatModelAdapter; started: (thread: ThreadRuntime) => void }) {
  const runtime = useLocalRuntime(adapter)
  useEffect(() => started(runtime.thread), [runtime, started])
  return <QueryClientProvider client={queryClient}>
    <AssistantRuntimeProvider runtime={runtime}>
      <TheoremPartRenderers />
      <Thread autoFocus={false} />
    </AssistantRuntimeProvider>
  </QueryClientProvider>
}
afterEach(cleanup)
afterEach(() => { setSystemTime() })
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
const reasoning: StoredPart = { partId: 'why', type: 'reasoning', payload: { text: 'Each city reports its own sunshine hours.' } }
/** A tool call the run cannot make until the person allows it. */
const awaitingApproval = (id: string, summary: string): StoredPart[] => [
  { partId: `${id}-call`, type: 'tool_call', payload: { toolCallId: id, toolName: 'bash', safeArguments: { command: 'curl wttr.in/Denver' } } },
  { partId: `${id}-approval`, type: 'tool_approval', payload: { approvalId: `approve-${id}`, toolCallId: id, toolName: 'bash', summary, risk: 'medium', status: 'requires_action' } },
]
const message = (messageId: string, role: Theorem.MessageRole, createdAtMs: number, parts: StoredPart[]): Theorem.Message => ({
  schema: 'theorem.chat.message.v1', messageId, tenantId: 'tenant',
  threadId: 'thread', originBranchId: 'branch', role, createdAtMs, parts,
})
/** A question, and the reply that arrived 42 seconds later. */
const turn = (parts: StoredPart[], step = 'complete') => toAssistantMessages([
  message('ask', 'user', 1_000, [{ partId: 'ask-text', type: 'text', payload: { text: 'How sunny is Denver?' } }]),
  message('answer', 'assistant', 43_000, [
    { partId: 'progress', type: 'progress', payload: { label: 'Searching the web', status: step } },
    ...parts,
    { partId: 'text', type: 'text', payload: { text: 'Denver gets 300 days of sun.' } },
  ]),
])
const withStatus = (messages: ThreadMessageLike[], status: ThreadMessageLike['status']) =>
  messages.map((item) => (item.role === 'assistant' ? { ...item, status } : item))

const activity = (root: ParentNode) => {
  const [line, ...more] = root.querySelectorAll('[data-slot="activity"]')
  if (!line || more.length > 0) throw new Error('expected one activity line')
  return line
}
const toolRows = (root: ParentNode) => root.querySelectorAll('[data-slot="tool-fallback-trigger"]')
const reasoningRows = (root: ParentNode) => root.querySelectorAll('[data-slot="reasoning-root"]')
const approvalCards = (root: ParentNode) => root.querySelectorAll('[data-slot="approval-card"]')

test('a finished turn is one line by the name, and Details opens its tool calls on a sheet', async () => {
  const { container } = await render(<Harness messages={turn([...search('s1', 'denver sun'), ...search('s2', 'denver snow')])} />)
  await waitFor(() => container.textContent.includes('Denver gets 300 days of sun.'))
  const line = activity(container)
  expect(line.textContent).toBe('Theorem·42s·Details')
  expect(toolRows(container)).toHaveLength(0)
  expect(container.textContent).not.toMatch(/tool calls?|Used tool|Done|Worked/)

  const details = buttonNamed(line, 'Details')
  if (!details) throw new Error('no Details control')
  await click(details)
  const sheet = await waitFor(() => line.querySelector('[data-slot="activity-details"]'))
  await waitFor(() => toolRows(sheet).length === 2)
  expect(sheet.textContent).toContain('Used tool: Web search')
  // The tool calls are on the sheet only, never in the reply.
  expect(toolRows(container)).toHaveLength(2)
})

test('a running turn names its live step on the line and keeps its tool calls closed', async () => {
  const running = withStatus(turn(search('s1', 'denver sun'), 'running'), { type: 'running' })
  const { container } = await render(<Harness isRunning messages={running} />)
  await waitFor(() => container.textContent.includes('Denver gets 300 days of sun.'))
  const line = activity(container)
  expect(line.textContent.replace(/\s+/g, ' ')).toContain('Searching the web')
  expect(line.textContent).not.toContain('Details')
  expect(toolRows(container)).toHaveLength(0)

  const step = line.querySelector('[role="button"]')
  if (!step) throw new Error('the live step does not open')
  await click(step)
  await waitFor(() => toolRows(line).length === 1)
})

test('a turn with nothing to open has no control on its line', async () => {
  const { container } = await render(<Harness messages={turn([])} />)
  await waitFor(() => container.textContent.includes('Denver gets 300 days of sun.'))
  const line = activity(container)
  expect(line.textContent).toBe('Theorem·42s')
  expect(line.querySelector('button, [role="button"]')).toBeNull()
})

test('a turn that stopped says so on its line', async () => {
  const stopped = withStatus(turn(search('s1', 'denver sun')), { type: 'incomplete', reason: 'cancelled' })
  const { container } = await render(<Harness messages={stopped} />)
  await waitFor(() => container.textContent.includes('Denver gets 300 days of sun.'))
  expect(activity(container).textContent).toBe('Theorem·Stopped·42s·Details')
})

test('an approval and the answer stay in the reply while reasoning and tool calls wait on the sheet', async () => {
  const parts = [reasoning, ...search('s1', 'denver sun'), ...awaitingApproval('b1', 'Allow bash to fetch the forecast?')]
  const waiting = withStatus(turn(parts, 'running'), { type: 'running' })
  const { container } = await render(<Harness isRunning messages={waiting} />)
  await waitFor(() => container.textContent.includes('Denver gets 300 days of sun.'))
  const line = activity(container)
  const reply = container.querySelector('[data-slot="aui_assistant-message-content"]')
  if (!reply) throw new Error('no reply')

  // Closed: the card and the answer are in the reply; the reasoning and the search are nowhere.
  expect(line.textContent.replace(/\s+/g, ' ')).toContain('Waiting for your approval')
  expect(approvalCards(reply)).toHaveLength(1)
  expect(reply.textContent).toContain('Allow bash to fetch the forecast?')
  expect(reply.textContent).toContain('Denver gets 300 days of sun.')
  expect(reasoningRows(container)).toHaveLength(0)
  expect(toolRows(container)).toHaveLength(0)

  const step = line.querySelector('[role="button"]')
  if (!step) throw new Error('the live step does not open')
  await click(step)
  const sheet = await waitFor(() => line.querySelector('[data-slot="activity-details"]'))
  await waitFor(() => reasoningRows(sheet).length === 1)
  expect(toolRows(sheet)).toHaveLength(1)
  // The reasoning row holds its text until it is pressed, like any other.
  const thought = sheet.querySelector('[data-slot="reasoning-trigger"]')
  if (!thought) throw new Error('the reasoning row does not open')
  await click(thought)
  await waitFor(() => sheet.textContent.includes('Each city reports its own sunshine hours.'))
  // Opened: each part is drawn once, the work on the sheet and the card and the answer still in the reply.
  expect(reasoningRows(container)).toHaveLength(1)
  expect(toolRows(container)).toHaveLength(1)
  expect(approvalCards(container)).toHaveLength(1)
  expect(approvalCards(reply)).toHaveLength(1)
  expect(reply.textContent).toContain('Denver gets 300 days of sun.')
})

test('a live turn says how long the person waited once it settles', async () => {
  setSystemTime(new Date(1_000))
  const contentOf = (step: string) => turn(search('s1', 'denver sun'), step)[1]?.content as ThreadAssistantMessagePart[]
  let finish = () => {}
  const held = new Promise<void>((resolve) => { finish = resolve })
  // The stream carries content and status; `timed`, as in the app's adapter, adds when it settled.
  const adapter: ChatModelAdapter = {
    run: () => timed((async function* () {
      yield { content: contentOf('running') }
      await held
      yield { content: contentOf('complete') }
    })()),
  }
  let thread: ThreadRuntime | undefined
  const { container } = await render(<LiveHarness adapter={adapter} started={(live) => { thread = live }} />)
  await act(async () => thread?.append('How sunny is Denver?'))
  await waitFor(() => activity(container).textContent.includes('Searching the web'))

  setSystemTime(new Date(43_000))
  await act(async () => finish())
  await waitFor(() => activity(container).textContent.includes('Details'))
  expect(activity(container).textContent).toBe('Theorem·42s·Details')
})
