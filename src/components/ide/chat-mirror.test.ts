import { expect, test } from 'bun:test'
import type { ThreadMessage } from '@assistant-ui/react'
import { toPart } from './chat-mirror'

type Part = ThreadMessage['content'][number]

function toolCall(approval: Record<string, unknown>): Part {
  return {
    type: 'tool-call',
    toolCallId: 'call_1',
    toolName: 'bash',
    args: {},
    argsText: '{}',
    interrupt: {
      type: 'human',
      payload: {
        approvalId: 'chatapproval_1',
        toolCallId: 'call_1',
        toolName: 'bash',
        summary: 'Allow bash to continue?',
        ...approval,
      },
    },
  } as Part
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
