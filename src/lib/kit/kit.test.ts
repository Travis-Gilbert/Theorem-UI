import { beforeEach, describe, expect, test } from 'bun:test'
import type { ThreadMessage } from '@assistant-ui/react'
import { approvalOutcome } from '@/components/chat/theorem-parts'
import { kitFactsOf } from './facts'
import {
  DONE_HOLD_MS,
  livenessOf,
  readExpression,
  resolvePose,
} from './liveness'
import {
  attendKit,
  forgetKit,
  reportKit,
  resetKit,
  settleKitExpression,
  tickKit,
  useKit,
} from './store'

const approvalPart = (fields: Record<string, unknown>) => ({
  type: 'tool-call',
  toolCallId: 'toolcall_1',
  toolName: 'terminal',
  args: {},
  argsText: '',
  interrupt: {
    type: 'human',
    payload: {
      type: 'tool_approval',
      partId: 'chatpart_approval',
      approvalId: 'approval_1',
      toolCallId: 'toolcall_1',
      toolName: 'terminal',
      ...fields,
    },
  },
})

const expressionPart = (partId: string, pose: string) => ({
  type: 'data',
  name: 'theorem-expression',
  data: { type: 'expression', partId, pose, energy: 0.4 },
})

const assistant = (...content: unknown[]) =>
  ({ role: 'assistant', id: 'live', content }) as unknown as ThreadMessage

describe('approval outcome', () => {
  test('mirrors ApprovalPart::outcome: only an awaiting status asks', () => {
    expect(
      approvalOutcome({ status: 'requires_action', approved: undefined }),
    ).toBe('awaiting')
    expect(approvalOutcome({ status: 'pending', approved: undefined })).toBe(
      'awaiting',
    )
    expect(approvalOutcome({ status: 'complete', approved: true })).toBe(
      'approved',
    )
    expect(approvalOutcome({ status: 'complete', approved: false })).toBe(
      'declined',
    )
    expect(approvalOutcome({ status: 'failed', approved: undefined })).toBe(
      'failed',
    )
    // Expired or replaced: incomplete with no decision.
    expect(approvalOutcome({ status: 'incomplete', approved: undefined })).toBe(
      'unanswered',
    )
  })
})

describe('liveness', () => {
  const facts = {
    asking: false,
    running: false,
    attending: false,
    doneUntil: 0,
  }

  test('asking outranks working, done holds before attend, then idle', () => {
    expect(livenessOf({ ...facts, asking: true, running: true }, 0)).toBe('ask')
    expect(livenessOf({ ...facts, running: true }, 0)).toBe('work')
    expect(livenessOf({ ...facts, attending: true, doneUntil: 10 }, 5)).toBe(
      'done',
    )
    expect(livenessOf({ ...facts, attending: true, doneUntil: 10 }, 10)).toBe(
      'attend',
    )
    expect(livenessOf(facts, 0)).toBe('idle')
  })

  test('pounce is a flourish for idle and done; a turn falls back to its default', () => {
    const pounce = { pose: 'pounce' as const }
    expect(resolvePose(pounce, 'idle')).toBe('pounce')
    expect(resolvePose(pounce, 'done')).toBe('pounce')
    expect(resolvePose(pounce, 'work')).toBe('lean_in')
    expect(resolvePose(pounce, 'ask')).toBe('tilt')
    expect(resolvePose(undefined, 'done')).toBe('nod')
  })

  test('an expression reads only the fields it carries, and drops unknown poses', () => {
    expect(
      readExpression({
        pose: 'think',
        energy: 0.6,
        gaze: [0.3, -0.1],
        extra: 1,
      }),
    ).toEqual({
      pose: 'think',
      energy: 0.6,
      gaze: [0.3, -0.1],
    })
    expect(readExpression({ pose: 'moonwalk', tilt: -0.2 })).toEqual({
      tilt: -0.2,
    })
    expect(readExpression(null)).toBeUndefined()
    expect(readExpression('think')).toBeUndefined()
  })
})

describe('facts from a conversation', () => {
  test('a pending approval asks; an expired one does not', () => {
    const pending = assistant(approvalPart({ status: 'requires_action' }))
    expect(kitFactsOf([pending], true).asking).toBe(true)
    const expired = assistant(
      approvalPart({
        status: 'incomplete',
        approved: null,
        reason: 'No answer within 15 minutes; the request expired.',
      }),
    )
    expect(kitFactsOf([expired], true).asking).toBe(false)
    const decided = assistant(
      approvalPart({ status: 'complete', approved: true }),
    )
    expect(kitFactsOf([decided], true).asking).toBe(false)
  })

  test("the live turn's newest expression is reported; a settled turn's is not", () => {
    const turn = assistant(
      expressionPart('chatpart_a', 'think'),
      expressionPart('chatpart_b', 'point'),
    )
    expect(kitFactsOf([turn], true).expression).toEqual({
      partId: 'chatpart_b',
      value: { pose: 'point', energy: 0.4 },
    })
    expect(kitFactsOf([turn], false).expression).toBeUndefined()
  })

  test('a conversation whose last word is the person asks nothing', () => {
    const user = {
      role: 'user',
      id: 'u',
      content: [],
    } as unknown as ThreadMessage
    expect(kitFactsOf([user], false)).toEqual({ running: false, asking: false })
  })
})

describe('Kit', () => {
  beforeEach(() => resetKit())

  test('a turn works, holds done, then rests', () => {
    reportKit('chat', { running: true, asking: false }, 0)
    expect(useKit.getState().liveness).toBe('work')
    reportKit('chat', { running: false, asking: false }, 100)
    expect(useKit.getState().liveness).toBe('done')
    expect(useKit.getState().pose).toBe('nod')
    tickKit(100 + DONE_HOLD_MS - 1)
    expect(useKit.getState().liveness).toBe('done')
    tickKit(100 + DONE_HOLD_MS)
    expect(useKit.getState().liveness).toBe('idle')
  })

  test('one figure across conversations: busy while any is', () => {
    reportKit('chat', { running: true, asking: false }, 0)
    reportKit('terminal', { running: true, asking: true }, 0)
    expect(useKit.getState().liveness).toBe('ask')
    reportKit('terminal', { running: false, asking: false }, 10)
    expect(useKit.getState().liveness).toBe('work')
    reportKit('chat', { running: false, asking: false }, 20)
    expect(useKit.getState().liveness).toBe('done')
  })

  test('composer focus attends once the done hold has passed', () => {
    attendKit(true, 0)
    expect(useKit.getState().liveness).toBe('attend')
    reportKit('chat', { running: true, asking: false }, 0)
    reportKit('chat', { running: false, asking: false }, 10)
    expect(useKit.getState().liveness).toBe('done')
    tickKit(10 + DONE_HOLD_MS)
    expect(useKit.getState().liveness).toBe('attend')
    attendKit(false, 10 + DONE_HOLD_MS)
    expect(useKit.getState().liveness).toBe('idle')
  })

  test('a conversation that unmounts mid-run is not a turn that ended', () => {
    reportKit('terminal', { running: true, asking: false }, 0)
    forgetKit('terminal', 5)
    expect(useKit.getState().liveness).toBe('idle')
  })

  test("the identity's expression mounts; the live turn's replaces it once", () => {
    settleKitExpression({ pose: 'sit', energy: 0.2 }, 0)
    expect(useKit.getState().expression).toEqual({ pose: 'sit', energy: 0.2 })
    expect(useKit.getState().pose).toBe('sit')
    const live = { partId: 'chatpart_x', value: { pose: 'think' as const } }
    reportKit('chat', { running: true, asking: false, expression: live }, 1)
    expect(useKit.getState().pose).toBe('think')
    // A later snapshot settles the identity's manner; replaying the same live
    // part does not apply it again.
    settleKitExpression({ pose: 'stretch' }, 2)
    reportKit('chat', { running: true, asking: true, expression: live }, 3)
    expect(useKit.getState().expression).toEqual({ pose: 'stretch' })
  })
})
