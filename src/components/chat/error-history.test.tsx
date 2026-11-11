import { afterEach, expect, test } from 'bun:test'
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { createContext, useContext } from 'react'
import { Thread } from '../assistant-ui/elements/thread.aui'
import { TheoremPartRenderers } from './theorem-parts'
import { cleanup, render, waitFor } from '../../../test/blocks/render'

import { TheoremError } from '@theoremharness/sdk'
import { describeError } from '@/lib/theorem/client'

const queryClient = new QueryClient()

const Messages = createContext<ThreadMessageLike[]>([])

function Chat() {
  const messages = useContext(Messages)
  const runtime = useExternalStoreRuntime({
    messages, isRunning: false, onNew: async () => {},
    convertMessage: (message: ThreadMessageLike) => message,
  })
  return <QueryClientProvider client={queryClient}>
    <AssistantRuntimeProvider runtime={runtime}>
      <TheoremPartRenderers />
      <Thread autoFocus={false} />
    </AssistantRuntimeProvider>
  </QueryClientProvider>
}

// The thread reads its route for the project context chip.
const router = createRouter({
  routeTree: createRootRoute({ component: Chat }),
  history: createMemoryHistory(),
})

function Harness({ messages }: { messages: ThreadMessageLike[] }) {
  return <Messages.Provider value={messages}>
    <RouterProvider router={router} />
  </Messages.Provider>
}
afterEach(cleanup)

test('a research failure with the same request reference renders once', async () => {
  const message = 'The source check returned an unusable assessment. The assessment omitted or repeated part of the answer.'
  const correlationId = 'chatreq-research-review'
  const { container } = await render(<Harness messages={[{
    id: 'research-failed', role: 'assistant',
    status: { type: 'incomplete', reason: 'error', error: `${message} Reference: ${correlationId}` },
    content: [{ type: 'data', name: 'theorem-error', data: {
      code: 'research_review_invalid_response', message, correlationId, recoverable: true,
    } }],
  }]} />)
  await waitFor(() => container.querySelector('[role="alert"]'))
  expect(container.textContent.match(/The source check returned an unusable assessment\./g)?.length).toBe(1)
  expect(container.textContent).toContain(correlationId)
  expect(container.querySelector('.aui-message-error-root')).toBeNull()
})

test('a failed turn renders one contextual error, and a plain runtime failure remains visible', async () => {
  const explanation = 'The agent reached its step limit.'
  const { container, rerender } = await render(<Harness messages={[{
    id: 'failed', role: 'assistant',
    status: { type: 'incomplete', reason: 'error', error: explanation },
    content: [{ type: 'data', name: 'theorem-error', data: {
      code: 'agent_iteration_limit', message: explanation, correlationId: 'chatreq-render',
    } }],
  }]} />)
  await waitFor(() => container.querySelector('[role="alert"]'))
  expect(container.textContent.match(/The agent reached its step limit\./g)?.length).toBe(1)
  expect(container.textContent).toContain('chatreq-render')
  expect(container.querySelector('.aui-message-error-root')).toBeNull()
  await rerender(<Harness messages={[{
    id: 'distinct', role: 'assistant',
    status: { type: 'incomplete', reason: 'error', error: 'The connection was interrupted.' },
    content: [{ type: 'data', name: 'theorem-error', data: {
      code: 'agent_iteration_limit', message: explanation, correlationId: 'chatreq-render',
    } }],
  }]} />)
  await waitFor(() => container.querySelector('.aui-message-error-root'))
  expect(container.textContent).toContain(explanation)
  expect(container.textContent).toContain('The connection was interrupted.')
  await rerender(<Harness messages={[{
    id: 'transport', role: 'assistant', content: [{ type: 'text', text: 'Partial answer' }],
    status: { type: 'incomplete', reason: 'error', error: 'The connection was interrupted.' },
  }]} />)
  await waitFor(() => container.querySelector('.aui-message-error-root'))
  expect(container.textContent).toContain('The connection was interrupted.')
})

test('source-bound journal capacity error renders its explanation, code and reference without a persistence claim', async () => {
  const error = describeError(new TheoremError({ statusCode: 500, body: {
    code: 'chat_store_error', title: 'The chat graph could not satisfy the request',
    detail: 'chunk_store_journal_io: append journal record: No space left on device (os error 28)',
    correlationId: 'chatreq_01M6QFM64PDHBTYJ7T036GDB3K',
  } }))
  const { container } = await render(<Harness messages={[{
    id: 'storage-full', role: 'assistant', content: [],
    status: { type: 'incomplete', reason: 'error', error },
  }]} />)
  const alert = await waitFor(() => container.querySelector('[role="alert"]'))
  expect(alert.textContent).toContain('The server ran out of storage')
  expect(alert.textContent).toContain('chat_store_error / chunk_store_journal_io')
  expect(alert.textContent).toContain('chatreq_01M6QFM64PDHBTYJ7T036GDB3K')
  expect(alert.textContent).not.toMatch(/message was (?:not )?saved|message was not sent/)
})
