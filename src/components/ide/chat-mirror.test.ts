import { expect, test } from 'bun:test'
import type { ThreadMessage } from '@assistant-ui/react'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import type { Theorem } from '@theoremharness/sdk'
import { toPart } from './chat-mirror'

type Part = ThreadMessage['content'][number]

/** A tool call and its approval, as the installed SDK maps them onto assistant-ui. */
function toolCall(approval: Record<string, unknown>): Part {
  const message = {
    messageId: 'msg_1',
    role: 'assistant',
    createdAtMs: 0,
    parts: [
      {
        partId: 'part_call',
        type: 'tool_call',
        payload: { toolCallId: 'call_1', toolName: 'bash', safeArguments: {} },
      },
      {
        partId: 'part_approval',
        type: 'tool_approval',
        payload: {
          approvalId: 'chatapproval_1',
          toolCallId: 'call_1',
          toolName: 'bash',
          summary: 'Allow bash to continue?',
          ...approval,
        },
      },
    ],
  } as unknown as Theorem.Message
  const [mapped] = toAssistantMessages([message])
  const content = mapped?.content
  if (!Array.isArray(content)) throw new Error('expected mapped parts')
  return content[0] as Part
}

function approvalOf(part: Part) {
  const mirrored = toPart(part, 'run_1')
  return mirrored?.type === 'tool-call' ? mirrored.approval : undefined
}

test('an awaiting approval goes to the frame as a question', () => {
  const approval = approvalOf(toolCall({ status: 'requires_action' }))
  expect(approval?.approvalId).toBe('chatapproval_1')
  expect(approval?.approved).toBeUndefined()
  expect(approval?.settled).toBeUndefined()
})

test('an expired approval goes settled with its reason, so the frame closes its prompt', () => {
  const reason = 'No answer within 15 minutes; the request expired.'
  const approval = approvalOf(
    toolCall({ status: 'incomplete', approved: null, reason }),
  )
  expect(approval?.approvalId).toBe('chatapproval_1')
  expect(approval?.settled).toEqual({ reason })
})

test('a decided approval carries the decision and is not marked settled', () => {
  const approval = approvalOf(toolCall({ status: 'complete', approved: false }))
  expect(approval?.approved).toBe(false)
  expect(approval?.settled).toBeUndefined()
})

test('a settled approval is not a pending action the frame or assistant-ui waits on', () => {
  const awaiting = toolCall({ status: 'requires_action' })
  const expired = toolCall({ status: 'incomplete', approved: null })
  const declined = toolCall({ status: 'complete', approved: false })
  expect(awaiting.type === 'tool-call' && awaiting.interrupt?.type).toBe('human')
  for (const settled of [expired, declined])
    expect(settled.type === 'tool-call' && settled.interrupt).toBeUndefined()
  expect(approvalOf(declined)?.approved).toBe(false)
})
