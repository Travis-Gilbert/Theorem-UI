import { beforeEach, describe, expect, test } from 'bun:test'
import type { ThreadMessage } from '@assistant-ui/react'
import { approvalOutcome } from '@/components/chat/theorem-parts'
import { SHIFT_MS, SLEEP_AFTER_MS, nextAct, poseAct } from './director'
import type { Act, Stage } from './director'
import { kitFactsOf } from './facts'
import {
  DONE_HOLD_MS,
  livenessOf,
  readExpression,
  resolvePose,
} from './liveness'
import { KIT_SHEET, frameAt, frameOrigin, readSheet, tagLength } from './sheet'
import type { AsepriteExport } from './sheet'
import {
  attendKit,
  forgetKit,
  reportKit,
  resetKit,
  settleKitExpression,
  tickKit,
  useKit,
  wakeKit,
} from './store'

/** A chance that answers these values in turn, then repeats them. */
const chances = (...values: number[]) => {
  let at = 0
  return () => values[at++ % values.length] ?? 0
}

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

describe('the sheet', () => {
  test('carries every pose, in square frames laid out row by row', () => {
    expect(KIT_SHEET.frame).toBe(32)
    expect(KIT_SHEET.columns).toBe(8)
    expect(KIT_SHEET.tags.pounce).toEqual([49, 61])
    expect(KIT_SHEET.tags.sleep).toEqual([81, 82])
    expect(frameOrigin(KIT_SHEET, 9)).toEqual([32, 32])
    expect(tagLength(KIT_SHEET, 'nod')).toBe(160 * 4 + 500)
  })

  test('a looping tag wraps; a tag played once holds its last frame', () => {
    // nod: frames 18 to 22, 160 ms each and a closing 500 ms.
    expect(frameAt(KIT_SHEET, 'nod', 0, false)).toEqual({
      index: 18,
      next: 160,
    })
    expect(frameAt(KIT_SHEET, 'nod', 170, false)).toEqual({
      index: 19,
      next: 150,
    })
    expect(frameAt(KIT_SHEET, 'nod', 1140 + 10, false)).toEqual({
      index: 18,
      next: 150,
    })
    expect(frameAt(KIT_SHEET, 'nod', 1140 + 10, true)).toEqual({
      index: 22,
      next: Infinity,
    })
  })

  test('a sheet missing a pose, or with a frame out of place, is refused', () => {
    const frame = (x: number, y: number) => ({
      frame: { x, y, w: 32, h: 32 },
      duration: 100,
    })
    const sheet = (frames: AsepriteExport['frames']): AsepriteExport => ({
      frames,
      meta: {
        size: { w: 64, h: 32 },
        frameTags: [{ name: 'rest', from: 0, to: 1 }],
      },
    })
    expect(() => readSheet(sheet([frame(0, 0), frame(32, 0)]))).toThrow(
      /no tag for lean_in/,
    )
    expect(() => readSheet(sheet([frame(0, 0), frame(0, 32)]))).toThrow(
      /frame 1 is not at 32,0/,
    )
  })
})

describe("the figure's own choices", () => {
  const stage = (fields: Partial<Stage> = {}): Stage => ({
    liveness: 'idle',
    pose: 'rest',
    chosen: false,
    lastShift: 0,
    idleSince: 0,
    ...fields,
  })

  test('idle rests, then shifts once the 20 s admission has passed, then rests again', () => {
    const random = chances(0)
    const rest = poseAct(stage(), 0, random)
    expect(rest).toMatchObject({
      tag: 'rest',
      until: SHIFT_MS,
      unprompted: false,
    })
    expect(nextAct(rest, stage(), SHIFT_MS - 1, random)).toBe(rest)
    // The first other idle pose: sway, looping, held for a while.
    const shift = nextAct(rest, stage(), SHIFT_MS, random)
    expect(shift).toMatchObject({ tag: 'sway', unprompted: true, once: false })
    const back = nextAct(
      shift,
      stage({ lastShift: SHIFT_MS }),
      shift.until,
      random,
    )
    expect(back).toMatchObject({ tag: 'rest', unprompted: false })
    expect(back.until - back.since).toBeGreaterThanOrEqual(SHIFT_MS)
  })

  test('no shift is admitted within 20 s of the last', () => {
    const rest = poseAct(stage(), 0, chances(0))
    const early = nextAct(
      rest,
      stage({ lastShift: 5_000 }),
      SHIFT_MS,
      chances(0),
    )
    expect(early).toMatchObject({ tag: 'rest', unprompted: false })
  })

  test('a long idle may end in sleep, which lasts until something happens', () => {
    const random = chances(0)
    const late = SLEEP_AFTER_MS + SHIFT_MS
    const rest = poseAct(stage(), late - SHIFT_MS, random)
    const sleep = nextAct(rest, stage(), late, random)
    expect(sleep).toMatchObject({ tag: 'sleep', until: Infinity })
    const attend = stage({ liveness: 'attend', pose: 'lean_in' })
    expect(nextAct(sleep, attend, late + 1, random).tag).toBe('lean_in')
  })

  test('done flourishes on its own unless the agent chose, and the flourish lands into idle', () => {
    const working: Act = poseAct(
      stage({ liveness: 'work', pose: 'lean_in' }),
      0,
      chances(0),
    )
    const done = stage({ liveness: 'done', pose: 'nod', lastShift: -SHIFT_MS })
    // Chance 0: flourish, and the first of celebrate, stretch, wave, pounce.
    const flourish = nextAct(working, done, 100, chances(0))
    expect(flourish).toMatchObject({ tag: 'celebrate', unprompted: true })
    expect(nextAct(working, done, 100, chances(0.9)).tag).toBe('nod')
    const chosen = { ...done, chosen: true }
    expect(nextAct(working, chosen, 100, chances(0)).tag).toBe('nod')

    const pounce = nextAct(working, done, 100, chances(0.4, 0.8))
    expect(pounce).toMatchObject({ tag: 'pounce', once: true })
    expect(pounce.until).toBe(100 + tagLength(KIT_SHEET, 'pounce'))
    const idle = stage({ lastShift: 100 })
    expect(nextAct(pounce, idle, 1_600, chances(0))).toBe(pounce)
    expect(nextAct(pounce, idle, pounce.until, chances(0)).tag).toBe('rest')
    // A new turn does not wait for the landing.
    const work = stage({ liveness: 'work', pose: 'lean_in', lastShift: 100 })
    expect(nextAct(pounce, work, 1_600, chances(0)).tag).toBe('lean_in')
  })

  test('work and ask hold their pose; nothing shifts on its own', () => {
    const work = stage({
      liveness: 'work',
      pose: 'think',
      chosen: true,
      lastShift: -SHIFT_MS,
    })
    const act = poseAct(work, 0, chances(0))
    expect(act.until).toBe(Infinity)
    expect(nextAct(act, work, 10 * SHIFT_MS, chances(0))).toBe(act)
  })
})

describe("Kit's clock", () => {
  beforeEach(() => resetKit({ random: chances(0) }))

  test('wakes once, and an idle deadline brings a shift', () => {
    wakeKit(1_000)
    const rest = useKit.getState().act
    expect(rest).toMatchObject({
      tag: 'rest',
      since: 1_000,
      until: 1_000 + SHIFT_MS,
    })
    wakeKit(2_000)
    expect(useKit.getState().act).toBe(rest)
    tickKit(rest.until)
    expect(useKit.getState().act).toMatchObject({
      tag: 'sway',
      unprompted: true,
    })
    expect(useKit.getState().lastShift).toBe(rest.until)
  })

  test('a fact that arrives before the clock starts nothing on its own', () => {
    reportKit('chat', { running: false, asking: false }, 5)
    expect(useKit.getState().act.since).toBe(0)
    reportKit('chat', { running: true, asking: false }, 6)
    expect(useKit.getState().act).toMatchObject({ tag: 'lean_in', since: 6 })
  })
})
