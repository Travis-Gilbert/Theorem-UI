import { act, useEffect } from 'react'
import { afterEach, expect, test } from 'bun:test'
import {
  AssistantRuntimeProvider,
  useAui,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { AppendMessage, ThreadMessageLike } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Thread } from '../assistant-ui/elements/thread.aui'
import { useComposerTools } from './composer-tools'
import { cleanup, render, waitFor } from '../../../test/blocks/render'

function Draft({ text }: { text: string }) {
  const aui = useAui()
  useEffect(() => {
    aui.composer.setText(text)
    aui.composer.setRunConfig({
      custom: {
        theoremTurnOptions: {
          modelId: 'selected/model',
          contextReferences: [{ resource: 'existing-context' }],
        },
      },
    })
  }, [aui, text])
  return null
}
function Harness({ text, sent }: { text: string; sent: AppendMessage[] }) {
  const runtime = useExternalStoreRuntime({
    messages: [],
    convertMessage: (message: ThreadMessageLike) => message,
    isRunning: false,
    onNew: async (message) => {
      sent.push(message)
    },
  })
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AssistantRuntimeProvider runtime={runtime}>
        <Draft text={text} />
        <Thread autoFocus={false} />
      </AssistantRuntimeProvider>
    </QueryClientProvider>
  )
}

afterEach(async () => {
  await cleanup()
  useComposerTools.setState({ web: false, diagram: false })
})
const sentText = (message: AppendMessage) =>
  message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')

for (const method of ['click', 'Enter'] as const) {
  test(`actual composer ${method} preserves enabled web request in exactly one submitted message`, async () => {
    const sent: AppendMessage[] = []
    const { container } = await render(
      <Harness text="Compare Chrome and Firefox" sent={sent} />,
    )
    const web = container.querySelector<HTMLButtonElement>(
      '[aria-label="Search the web"]',
    )!
    await act(() => web.click())
    expect(web.getAttribute('aria-pressed')).toBe('true')
    const input = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Message input"]',
    )!
    const send = container.querySelector<HTMLButtonElement>(
      '[aria-label="Send message"]',
    )!
    await waitFor(() => !send.disabled)
    await act(() =>
      method === 'click'
        ? send.click()
        : input.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
          ),
    )
    await waitFor(() => sent.length)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.runConfig).toEqual({
      custom: {
        theoremTurnOptions: {
          modelId: 'selected/model',
          contextReferences: [{ resource: 'existing-context' }],
        },
      },
    })
    expect(sentText(sent[0]!)).toBe(
      'Compare Chrome and Firefox\n\nSearch the web for this.',
    )
    expect(input.value).toBe('')
  })
}

for (const [web, diagram, text, expected] of [
  [false, false, 'Compare browsers', 'Compare browsers'],
  [
    false,
    true,
    'Compare browsers',
    'Compare browsers\n\nShow this as a diagram.',
  ],
  [
    true,
    true,
    'Compare browsers',
    'Compare browsers\n\nSearch the web for this.\n\nShow this as a diagram.',
  ],
  [
    true,
    true,
    'Compare browsers\n\nSearch the web for this.\n\nShow this as a diagram.',
    'Compare browsers\n\nSearch the web for this.\n\nShow this as a diagram.',
  ],
] as const) {
  test(`composer sends selected requests once: web=${web} diagram=${diagram} existing=${text.includes('Search')}`, async () => {
    useComposerTools.setState({ web, diagram })
    const sent: AppendMessage[] = []
    const { container } = await render(<Harness text={text} sent={sent} />)
    const send = container.querySelector<HTMLButtonElement>(
      '[aria-label="Send message"]',
    )!
    await waitFor(() => !send.disabled)
    await act(() => send.click())
    await waitFor(() => sent.length)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.runConfig).toEqual({
      custom: {
        theoremTurnOptions: {
          modelId: 'selected/model',
          contextReferences: [{ resource: 'existing-context' }],
        },
      },
    })
    expect(sentText(sent[0]!)).toBe(expected)
    expect(
      container.querySelector<HTMLTextAreaElement>('textarea')!.value,
    ).toBe('')
  })
}

test('blank composer stays disabled and Shift+Enter does not send or alter the draft', async () => {
  useComposerTools.setState({ web: true, diagram: true })
  const sent: AppendMessage[] = []
  const { container, rerender } = await render(<Harness text="" sent={sent} />)
  expect(
    container.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!
      .disabled,
  ).toBe(true)
  const emptyInput = container.querySelector<HTMLTextAreaElement>(
    '[aria-label="Message input"]',
  )!
  await act(() =>
    emptyInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    ),
  )
  expect(sent).toHaveLength(0)
  expect(emptyInput.value).toBe('')
  await rerender(<Harness text="Draft" sent={sent} />)
  const input = container.querySelector<HTMLTextAreaElement>(
    '[aria-label="Message input"]',
  )!
  await act(() =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        bubbles: true,
      }),
    ),
  )
  expect(sent).toHaveLength(0)
  expect(input.value).toBe('Draft')
})
