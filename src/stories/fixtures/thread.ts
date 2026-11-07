// SOURCING: none: the conversation from docs/plans/evidence/refs/sidebar-compare@2026-11-05.webp, in the SDK's own message shape.
import type { Theorem } from '@/lib/theorem/client'

const message = (
  messageId: string,
  role: Theorem.MessageRole,
  text: string,
  atMs: number,
  work: Theorem.StoredPart[] = [],
): Theorem.Message => ({
  schema: 'theorem.chat.message.v1',
  messageId,
  tenantId: 'story',
  threadId: 'thread-app-gallery',
  originBranchId: 'branch-main',
  role,
  parts: [
    ...work,
    { partId: `${messageId}-text`, type: 'text', payload: { text } },
  ],
  createdAtMs: atMs,
})

export const threadMessages = (now: number) => [
  message(
    'message-ask',
    'user',
    'Show me two ways to browse the apps I\'ve built.',
    now - 9 * 60_000,
  ),
  message(
    'message-answer',
    'assistant',
    'Two layouts are ready. Choose one, or combine the details you like.',
    now - 9 * 60_000 + 42_000,
    [
      {
        partId: 'work-reasoning',
        type: 'reasoning',
        payload: { text: 'Grouped the gallery two ways against its current data.' },
      },
      {
        partId: 'work-call',
        type: 'tool_call',
        payload: {
          toolCallId: 'work-1',
          toolName: 'show_options',
          argumentsText: '{"title":"App gallery"}',
        },
      },
      {
        partId: 'work-result',
        type: 'tool_result',
        payload: { toolCallId: 'work-1', toolName: 'show_options', output: 'Shown.' },
      },
    ],
  ),
]
