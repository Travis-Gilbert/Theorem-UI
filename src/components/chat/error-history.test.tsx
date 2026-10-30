import { afterEach, expect, test } from 'bun:test'
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { Thread } from '../assistant-ui/elements/thread.aui'
import { TheoremPartRenderers } from './theorem-parts'
import { cleanup, render, waitFor } from '../../../test/blocks/render'

function Harness({ messages }: { messages: ThreadMessageLike[] }) {
  const runtime = useExternalStoreRuntime({
    messages, isRunning: false, onNew: async () => {},
    convertMessage: (message: ThreadMessageLike) => message,
  })
  return <AssistantRuntimeProvider runtime={runtime}>
    <TheoremPartRenderers />
    <Thread autoFocus={false} />
  </AssistantRuntimeProvider>
}
afterEach(cleanup)

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
    id: 'transport', role: 'assistant', content: [{ type: 'text', text: 'Partial answer' }],
    status: { type: 'incomplete', reason: 'error', error: 'The connection was interrupted.' },
  }]} />)
  await waitFor(() => container.querySelector('.aui-message-error-root'))
  expect(container.textContent).toContain('The connection was interrupted.')
})
