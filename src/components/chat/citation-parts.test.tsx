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
  sourceKind: string | undefined = 'web_search',
  excerpt = 'A retrieved comparison excerpt.',
) {
  return {
    schema: 'theorem.chat.message.v1', messageId: 'search-answer', tenantId: 'tenant',
    threadId: 'thread', originBranchId: 'branch', role: 'assistant', createdAtMs: 1,
    parts: [{ partId: 'source-1', type: 'citation', payload: {
      sourceId: 'hit-1', sourceKind, label: 'Browser comparison',
      provenance: { url, excerpt },
    } }],
  } satisfies Theorem.Message
}

test('retrieved search sources render safe links and retain their meaning after history reload', async () => {
  const stored = storedCitation('https://example.com/browsers?q=chrome&lang=en')
  const { container, rerender } = await render(<Harness messages={toAssistantMessages([stored])} />)
  await waitFor(() => container.textContent.includes('Browser comparison'))
  const link = container.querySelector('a')
  expect(link?.getAttribute('href')).toBe('https://example.com/browsers?q=chrome&lang=en')
  expect(link?.textContent).toBe('Search source: Browser comparison')
  expect(link?.getAttribute('title')).toBe('Retrieved search result, not independent verification. A retrieved comparison excerpt.')
  expect(link?.getAttribute('target')).toBe('_blank')
  expect(link?.getAttribute('rel')).toContain('noreferrer')
  await rerender(<Harness messages={[]} />)
  await rerender(<Harness messages={toAssistantMessages([JSON.parse(JSON.stringify(stored))])} />)
  const restored = await waitFor(() => container.querySelector('a[href="https://example.com/browsers?q=chrome&lang=en"]'))
  expect(restored.textContent).toBe('Search source: Browser comparison')
})

for (const url of ['javascript:alert(1)', 'data:text/html,bad', 'file:///etc/passwd', '//example.com', '/relative', 'not a URL', undefined]) {
  test(`a source with an unsafe or missing URL stays visible without a link: ${url}`, async () => {
    const { container } = await render(<Harness messages={toAssistantMessages([storedCitation(url)])} />)
    await waitFor(() => container.textContent.includes('Browser comparison'))
    expect(container.querySelectorAll('a').length).toBe(0)
    expect(container.textContent).toContain('Search source: Browser comparison')
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

test('search excerpts decode highlights and entities as inert readable tooltip text', async () => {
  const stored = storedCitation('https://example.com/source', 'web_search', '<strong>Firefox</strong> isn&#x27;t Chrome &amp; &lt;code&gt;.<script>bad()</script><style>body{display:none}</style><img src="/unsafe" onerror="bad()">')
  const { container } = await render(<Harness messages={toAssistantMessages([stored])} />)
  const link = await waitFor(() => container.querySelector('a'))
  expect(link.getAttribute('title')).toBe("Retrieved search result, not independent verification. Firefox isn't Chrome & <code>.")
  expect(container.querySelectorAll('script, style, img, strong').length).toBe(0)
  expect(link.getAttribute('href')).toBe('https://example.com/source')
})

test('retrieved page excerpts preserve literal code and identify page evidence', async () => {
  const stored = storedCitation('https://example.com/page', 'web_read', 'Use <strong> and &#x27; literally in this example.')
  const { container } = await render(<Harness messages={toAssistantMessages([stored])} />)
  const link = await waitFor(() => container.querySelector('a'))
  expect(link.textContent).toBe('Page source: Browser comparison')
  expect(link.getAttribute('title')).toBe('Retrieved page, not independent verification. Use <strong> and &#x27; literally in this example.')
})
