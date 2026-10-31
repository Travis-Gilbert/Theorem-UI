// SDK 0.5 maps only thread.lastRun to status. Durable error parts also belong
// to older turns, so restore each message's status after the SDK maps its parts.
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { describeRunFailure } from './client'

export function hasTheoremError(content: ThreadMessageLike['content'], message?: string): boolean {
  return Array.isArray(content) && content.some((part) => {
    if (part.type !== 'data' || part.name !== 'theorem-error') return false
    if (message === undefined) return true
    const data = part.data && typeof part.data === 'object' && !Array.isArray(part.data)
      ? part.data as Record<string, unknown> : {}
    return describeRunFailure(data) === message || data.message === message
  })
}

export function toHistoryMessages(
  ...args: Parameters<typeof toAssistantMessages>
): ReturnType<typeof toAssistantMessages> {
  return toAssistantMessages(...args).map((message) => {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) return message
    const failure = message.content.find(
      (part) => part.type === 'data' && part.name === 'theorem-error',
    )
    if (!failure || failure.type !== 'data') return message
    const data = failure.data && typeof failure.data === 'object' && !Array.isArray(failure.data)
      ? failure.data as Record<string, unknown> : {}
    // Preserve the SDK's authoritative cancellation/interrupt classification.
    if (message.status?.type === 'incomplete') return message
    return {
      ...message,
      status: {
        type: 'incomplete',
        reason: data.code === 'interrupted' ? 'other' : 'error',
        error: describeRunFailure(data),
      },
    }
  })
}
