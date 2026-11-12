// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import { awaitsDecision, choicesOf, outcomeOf, readApproval } from './approval'

const artifact = (approval: Record<string, unknown>) => ({ theoremApproval: approval })

describe('approval snapshot', () => {
  test('needs an approval and tool call id', () => {
    expect(readApproval(undefined)).toBeUndefined()
    expect(readApproval(artifact({ approvalId: 'a' }))).toBeUndefined()
    expect(readApproval(artifact({ approvalId: 'a', toolCallId: 't' }))?.status).toBe('pending')
  })

  test('awaits a decision only while undecided and open', () => {
    const open = readApproval(artifact({ approvalId: 'a', toolCallId: 't', status: 'requires_action' }))!
    const decided = readApproval(
      artifact({ approvalId: 'a', toolCallId: 't', status: 'requires_action', approved: true }),
    )!
    const closed = readApproval(artifact({ approvalId: 'a', toolCallId: 't', status: 'expired' }))!
    expect(awaitsDecision(open)).toBe(true)
    expect(awaitsDecision(decided)).toBe(false)
    expect(awaitsDecision(closed)).toBe(false)
    expect(outcomeOf(decided)).toBe('Allowed')
    expect(outcomeOf(closed)).toBe('expired')
  })

  test('offers allow and deny when the request names no options', () => {
    const approval = readApproval(artifact({ approvalId: 'a', toolCallId: 't' }))!
    expect(choicesOf(approval).map((choice) => choice.choice)).toEqual([
      { decision: 'allow' },
      { decision: 'deny' },
    ])
  })

  test('orders known option kinds and keeps unknown ones last', () => {
    const approval = readApproval(
      artifact({
        approvalId: 'a',
        toolCallId: 't',
        options: [
          { optionId: 'x', kind: 'future_kind', name: 'Later' },
          { optionId: 'r', kind: 'reject_once', name: 'Reject' },
          { optionId: 'o', kind: 'allow_once', name: 'Once' },
          { optionId: 'bad' },
        ],
      }),
    )!
    expect(choicesOf(approval).map((choice) => [choice.label, choice.grants])).toEqual([
      ['Once', true],
      ['Reject', false],
      ['Later', false],
    ])
  })
})
