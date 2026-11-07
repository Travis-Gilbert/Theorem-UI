import { afterEach, expect, test } from 'bun:test'
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import type { ThreadMessageLike } from '@assistant-ui/react'
import type { Theorem } from '@/lib/theorem/client'
import { Thread } from '../assistant-ui/elements/thread.aui'
import { TheoremPartRenderers } from './theorem-parts'
import { cleanup, render, waitFor } from '../../../test/blocks/render'

const queryClient = new QueryClient()
function Harness({ messages }: { messages: ThreadMessageLike[] }) {
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
afterEach(cleanup)

function storedCitation(
  url?: string,
  sourceKind: string | undefined = 'document',
  excerpt = 'A retrieved comparison excerpt.',
) {
  return {
    schema: 'theorem.chat.message.v1', messageId: 'search-answer', tenantId: 'tenant',
    threadId: 'thread', originBranchId: 'branch', role: 'assistant', createdAtMs: 1,
    parts: [
      { partId: 'answer', type: 'text', payload: { text: 'Here is what I found.' } },
      { partId: 'source-1', type: 'citation', payload: {
        sourceId: 'hit-1', sourceKind, label: 'Browser comparison',
        provenance: { url, excerpt },
      } },
    ],
  } satisfies Theorem.Message
}

for (const sourceKind of ['web_search', 'web_read']) {
  test(`a ${sourceKind} source draws no tag; the answer and its tool call carry it`, async () => {
    const stored = storedCitation('https://example.com/browsers', sourceKind)
    const { container } = await render(<Harness messages={toAssistantMessages([stored])} />)
    await waitFor(() => container.textContent.includes('Here is what I found.'))
    expect(container.textContent).not.toContain('Browser comparison')
    expect(container.querySelector('a[href="https://example.com/browsers"]')).toBeNull()
  })
}

for (const url of ['javascript:alert(1)', 'data:text/html,bad', 'file:///etc/passwd', '//example.com', '/relative', 'not a URL', undefined]) {
  test(`a source with an unsafe or missing URL stays visible without a link: ${url}`, async () => {
    const { container } = await render(<Harness messages={toAssistantMessages([storedCitation(url)])} />)
    await waitFor(() => container.textContent.includes('Browser comparison'))
    expect(container.querySelectorAll('a').length).toBe(0)
  })
}

test('ordinary citations keep their label and HTTP links remain supported', async () => {
  const stored = storedCitation('http://example.com/source', 'document')
  const { container } = await render(<Harness messages={toAssistantMessages([stored])} />)
  const link = await waitFor(() => container.querySelector('a'))
  expect(link.textContent).toBe('Browser comparison')
  expect(link.getAttribute('href')).toBe('http://example.com/source')
  expect(link.getAttribute('title')).toBe('A retrieved comparison excerpt.')
})

test('GFM renders supplied Markdown URLs but does not guess URLs for plain source labels', async () => {
  const { container } = await render(<Harness messages={[{
    id: 'markdown', role: 'assistant', content: [{ type: 'text', text: '[PCMag] and [Mozilla](https://www.mozilla.org/)' }],
  }]} />)
  const link = await waitFor(() => container.querySelector('a[href="https://www.mozilla.org/"]'))
  expect(link.textContent).toBe('Mozilla')
  expect(container.textContent).toContain('[PCMag]')
  expect(container.querySelectorAll('a')).toHaveLength(1)
})
