import { beforeEach, describe, expect, test } from 'bun:test'
import type { Act } from './director'
import {
  FEET,
  KIT_SIZE,
  atOf,
  changeStage,
  landingLine,
  resetKitStage,
  shownTag,
  standPoint,
  useKitStage,
} from './stage'
import type { PerchLine } from './stage'

const composer: PerchLine = { name: 'composer', left: 600, right: 1000, y: 300 }
const rail: PerchLine = { name: 'rail', left: 6, right: 38, y: 680 }
const floor: PerchLine = { name: 'floor', left: 0, right: 1200, y: 798 }

const act = (tag: Act['tag'], since = 0): Act => ({
  tag,
  liveness: 'idle',
  pose: 'rest',
  chosen: false,
  since,
  until: Infinity,
  once: false,
  unprompted: false,
})

beforeEach(() => resetKitStage())

describe('where Kit stands on a perch', () => {
  test('keeps the whole frame on the line, feet on it', () => {
    expect(standPoint(composer, 0)).toEqual([600, 300 - FEET])
    expect(standPoint(composer, 1)).toEqual([1000 - KIT_SIZE, 300 - FEET])
    expect(standPoint(composer, 2)).toEqual(standPoint(composer, 1))
  })

  test('a slot as wide as Kit has one place to stand', () => {
    expect(standPoint(rail, 0)).toEqual(standPoint(rail, 1))
    expect(atOf(rail, 6)).toBe(0.5)
  })

  test('reads back where along the line a frame stands', () => {
    const [x] = standPoint(composer, 0.3)
    expect(atOf(composer, x)).toBeCloseTo(0.3)
    expect(atOf(composer, -50)).toBe(0)
  })
})

describe('what catches Kit when it falls', () => {
  const lines = [composer, rail, floor]

  test('the highest line below its feet that it is over', () => {
    expect(landingLine(lines, 700, 100)?.name).toBe('composer')
  })

  test('a line above its feet does not catch it', () => {
    expect(landingLine(lines, 700, 400)?.name).toBe('floor')
  })

  test('off the end of the composer it falls past it', () => {
    expect(landingLine(lines, 300, 100)?.name).toBe('floor')
  })

  test('standing on a line, that line holds it', () => {
    const [x, y] = standPoint(composer, 0.5)
    expect(landingLine(lines, x, y)?.name).toBe('composer')
  })
})

describe('what the sprite shows', () => {
  test('its body while it moves, over any gesture or act', () => {
    changeStage(
      {
        motion: 'walk',
        gesture: { tag: 'wave', since: 0, until: 9e15, once: false },
      },
      50,
    )
    expect(shownTag(useKitStage.getState(), act('sleep'), 100)).toEqual({
      tag: 'walk',
      since: 50,
      once: false,
    })
  })

  test('a gesture while it lasts, then the act again', () => {
    changeStage({ gesture: { tag: 'nod', since: 10, until: 500, once: true } })
    const stage = useKitStage.getState()
    expect(shownTag(stage, act('rest'), 100).tag).toBe('nod')
    expect(shownTag(stage, act('rest', 7), 600)).toEqual({
      tag: 'rest',
      since: 7,
      once: false,
    })
  })

  test('every change counts; a new motion starts its clock, the same motion keeps it', () => {
    const before = useKitStage.getState().revision
    changeStage({ motion: 'run' }, 100)
    changeStage({ motion: 'run' }, 200)
    changeStage({ at: 0.4 }, 300)
    const state = useKitStage.getState()
    expect(state.revision).toBe(before + 3)
    expect(state.motionSince).toBe(100)
  })
})
