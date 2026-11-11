import { afterEach, expect, test } from 'bun:test'
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { TheoremPartRenderers } from './theorem-parts'
import { cleanup, render, waitFor } from '../../../test/blocks/render'

afterEach(cleanup)

function Message() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  )
}

function Harness({ status }: { status: string }) {
  const runtime = useExternalStoreRuntime({
    messages: [
      {
        id: 'response',
        role: 'assistant',
        content: [
          {
            type: 'data',
            name: 'theorem-user_input',
            data: {
              text: '# Follow-up\n\nKeep \\*literal\\* and **bold**.\n\nUse :tool[recall] and `:tool[code]`.\n\nA\\\nB',
              status,
              reason: 'run_ended',
            },
          },
        ],
      },
    ],
    convertMessage: (message: ThreadMessageLike) => message,
    isRunning: false,
    onNew: async () => {},
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TheoremPartRenderers />
      <ThreadPrimitive.Root>
        <ThreadPrimitive.Messages components={{ Message }} />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}

for (const [status, note] of [
  ['queued', 'queued for its next step'],
  ['delivered', undefined],
  ['not_delivered', 'not delivered: the run ended first'],
] as const) {
  test(`a ${status} run input renders the same document and retains its delivery status`, async () => {
    const { container } = await render(<Harness status={status} />)
    const input = await waitFor(() =>
      container.querySelector('[data-slot="theorem-user-input"]'),
    )
    expect(input.getAttribute('data-status')).toBe(status)
    expect(input.querySelector('h1')?.textContent).toBe('Follow-up')
    expect(input.textContent).toContain('Keep *literal* and bold.')
    expect(input.querySelector('em')).toBeNull()
    expect(input.querySelector('strong')?.textContent).toBe('bold')
    expect(input.querySelector('code')?.textContent).toBe(':tool[code]')
    expect(
      input.querySelector('[data-slot="directive-text-chip"]')?.textContent,
    ).toBe('recall')
    expect(input.querySelector('p br')).not.toBeNull()
    if (note) expect(input.textContent).toContain(note)
    else expect(input.textContent).not.toContain('queued for its next step')
  })
}
