import { expect, test } from 'bun:test'
import { toHistoryMessages, hasTheoremError } from './message-history'
import type { Theorem } from './client'

function assistant(id: string, parts: Theorem.StoredPart[]): Theorem.Message {
  return {
    schema: 'theorem.chat.message.v1', messageId: id, tenantId: 'tenant',
    threadId: 'thread', originBranchId: 'branch', role: 'assistant',
    runId: `run-${id}`, parts, createdAtMs: 1,
  }
}
const failure = {
  partId: 'error-1', type: 'error', payload: {
    code: 'agent_iteration_limit', message: 'The agent reached its step limit.',
    correlationId: 'chatreq-regression', recoverable: true,
  },
}

test('reload restores an earlier failed turn even after a subsequent successful turn', () => {
  const messages = toHistoryMessages([
    assistant('failed', [failure]),
    assistant('completed', [{ partId: 'text-2', type: 'text', payload: { text: 'Done.' } }]),
  ])
  expect(messages[0]?.status).toEqual({
    type: 'incomplete', reason: 'error',
    error: 'The agent reached its step limit. Reference: chatreq-regression',
  })
  expect(messages[1]?.status).toEqual({ type: 'complete', reason: 'unknown' })
  expect(hasTheoremError(messages[0]!.content)).toBe(true)
  expect(hasTheoremError(messages[1]!.content)).toBe(false)
})

test('tool failures alone do not mark a recovered response as failed', () => {
  const [message] = toHistoryMessages([assistant('recovered', [
    { partId: 'tool', type: 'tool_result', payload: { toolCallId: 'call', status: 'failed', safeOutput: { error: 'unavailable' } } },
    { partId: 'text', type: 'text', payload: { text: 'Here is an alternative.' } },
  ])])
  expect(message?.status?.type).toBe('complete')
  expect(hasTheoremError(message!.content)).toBe(false)
})

test('plain runtime errors retain their standard error renderer', () => {
  expect(hasTheoremError([{ type: 'text', text: 'partial response' }])).toBe(false)
  expect(hasTheoremError('partial response')).toBe(false)
})
