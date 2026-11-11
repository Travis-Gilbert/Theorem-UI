import { describe, expect, test } from 'bun:test'
import {
  aliasOf,
  kindOf,
  noteOf,
  pick,
  stand,
  thingName,
  thingProps,
  toolState,
  whereOf,
} from './things'
import type { Box, Found } from './things'

const box = (
  left: number,
  top: number,
  right: number,
  bottom: number,
): Box => ({
  left,
  top,
  right,
  bottom,
})

const PAGE = { width: 1000, height: 800 }
const VIEW = box(0, 0, 1000, 800)
const SIZE = { width: 60, height: 40 }
const MARGIN = 8

const found = (about: Partial<Found> & { box: Box }): Found => ({
  name: 'tool:a',
  view: VIEW,
  closed: false,
  ...about,
})

/** Whether a figure standing at a place lies over a box. */
const over = (at: { x: number; y: number }, target: Box) =>
  at.x + SIZE.width / 2 > target.left &&
  at.x - SIZE.width / 2 < target.right &&
  at.y + SIZE.height / 2 > target.top &&
  at.y - SIZE.height / 2 < target.bottom

describe('names', () => {
  test('a name is a kind and an id', () => {
    expect(kindOf('tool:call_1')).toBe('tool')
    expect(thingName('change', 'dlg 1/src/a b.ts')).toBe(
      'change:dlg-1/src/a-b.ts',
    )
    expect(thingName('tool', 'x'.repeat(400)).length).toBe(125)
  })

  test('last and failed name whichever is newest', () => {
    expect(aliasOf('tool:failed')).toEqual({ kind: 'tool', which: 'failed' })
    expect(aliasOf('artifact:last')).toEqual({
      kind: 'artifact',
      which: 'last',
    })
    expect(aliasOf('tool:call_1')).toBeUndefined()
    const things = [
      { name: 'tool:a', state: 'failed' },
      { name: 'message:m' },
      { name: 'tool:b', state: 'failed' },
      { name: 'tool:c', state: 'done' },
    ]
    expect(pick(things, 'tool:failed')?.name).toBe('tool:b')
    expect(pick(things, 'tool:last')?.name).toBe('tool:c')
    expect(pick(things, 'tool:a')?.name).toBe('tool:a')
    expect(pick(things, 'artifact:last')).toBeUndefined()
    expect(pick(things, 'tool:nope')).toBeUndefined()
  })

  test('a component names what it draws with attributes', () => {
    expect(thingProps('tool', 'call 1', { label: 'Read file' })).toEqual({
      'data-face-thing': 'tool:call-1',
      'data-face-label': 'Read file',
    })
    expect(thingProps('message', 'm1', { state: 'failed' })).toEqual({
      'data-face-thing': 'message:m1',
      'data-face-state': 'failed',
    })
    expect(thingProps('artifact', 'a', {})).toEqual({
      'data-face-thing': 'artifact:a',
    })
  })

  test('what became of a tool call is said in one word', () => {
    expect(toolState({ type: 'running' })).toBe('running')
    expect(toolState({ type: 'complete' })).toBe('done')
    expect(toolState({ type: 'complete' }, true)).toBe('failed')
    expect(toolState({ type: 'incomplete', reason: 'error' })).toBe('failed')
    expect(toolState({ type: 'incomplete', reason: 'cancelled' })).toBe(
      'cancelled',
    )
    expect(toolState({ type: 'requires-action' })).toBe('waiting')
    expect(toolState(undefined)).toBeUndefined()
  })
})

describe('whether a thing shows', () => {
  test('a sliver is enough; none is not', () => {
    expect(whereOf(box(0, 100, 10, 200), VIEW)).toBe('in view')
    expect(whereOf(box(0, -190, 10, 10), VIEW)).toBe('in view')
    expect(whereOf(box(0, -190, 10, 4), VIEW)).toBe('above')
    expect(whereOf(box(0, 796, 10, 900), VIEW)).toBe('below')
    expect(whereOf(box(0, 790, 10, 900), VIEW)).toBe('in view')
  })
})

describe('where the face stands to point', () => {
  test('beside the thing and never over it, level with it, looking at it', () => {
    const card = box(300, 100, 700, 160)
    const standing = stand(found({ box: card }), SIZE, PAGE, MARGIN)
    expect(standing.where).toBe('in view')
    expect(over(standing.at, card)).toBe(false)
    expect(standing.at.x).toBeGreaterThan(card.right)
    expect(standing.at.y).toBe(130)
    expect(standing.look.x).toBeLessThan(card.right)
    expect(standing.look.x).toBeGreaterThan(card.left)
    expect(standing.mark).toEqual({ box: card, kind: 'whole' })
  })

  test('on the side the part is nearer, level with the part, which is what is marked', () => {
    const card = box(300, 100, 700, 400)
    const words = box(310, 300, 400, 316)
    const standing = stand(
      found({ box: card, part: words, partKind: 'text' }),
      SIZE,
      PAGE,
      MARGIN,
    )
    expect(standing.at.x).toBeLessThan(card.left)
    expect(standing.at.y).toBe(308)
    expect(standing.look).toEqual({ x: 355, y: 308 })
    expect(standing.mark).toEqual({ box: words, kind: 'text' })
    const line = box(600, 200, 690, 216)
    const right = stand(
      found({ box: card, part: line, partKind: 'line' }),
      SIZE,
      PAGE,
      MARGIN,
    )
    expect(right.at.x).toBeGreaterThan(card.right)
    expect(right.mark?.kind).toBe('line')
  })

  test('with room on one side only it takes that side', () => {
    const left = stand(found({ box: box(20, 100, 600, 160) }), SIZE, PAGE, 8)
    expect(left.at.x).toBeGreaterThan(600)
    const right = stand(found({ box: box(400, 100, 980, 160) }), SIZE, PAGE, 8)
    expect(right.at.x).toBeLessThan(400)
  })

  test('with no room either side it sits above the part, inside the thing', () => {
    const wide = box(20, 100, 980, 500)
    const words = box(200, 300, 320, 316)
    const standing = stand(
      found({ box: wide, part: words, partKind: 'text' }),
      SIZE,
      PAGE,
      MARGIN,
    )
    expect(over(standing.at, words)).toBe(false)
    expect(standing.at.y).toBeLessThan(words.top)
    expect(standing.at.x).toBeGreaterThan(wide.left)
    expect(standing.at.x).toBeLessThan(wide.right)
  })

  test('a tall thing is pointed at by its head', () => {
    const tall = box(300, 100, 700, 700)
    expect(stand(found({ box: tall }), SIZE, PAGE, MARGIN).at.y).toBe(136)
  })

  test('a thing out of view has the face at that edge looking beyond it, and nothing marked', () => {
    const below = stand(found({ box: box(300, 900, 700, 960) }), SIZE, PAGE, 8)
    expect(below.where).toBe('below')
    expect(below.at.y).toBeLessThan(VIEW.bottom)
    expect(below.at.y).toBeGreaterThan(VIEW.bottom - SIZE.height - 16)
    expect(below.look.y).toBeGreaterThan(VIEW.bottom)
    expect(below.mark).toBeUndefined()
    const above = stand(
      found({ box: box(300, -200, 700, -140) }),
      SIZE,
      PAGE,
      8,
    )
    expect(above.where).toBe('above')
    expect(above.at.y).toBeLessThan(SIZE.height + 16)
    expect(above.look.y).toBeLessThan(0)
    expect(above.mark).toBeUndefined()
  })

  test('what covers the foot of the page counts as out of view', () => {
    // A composer floating over the last 200 px.
    const view = box(0, 0, 1000, 600)
    const standing = stand(
      found({ box: box(300, 640, 700, 700), view }),
      SIZE,
      PAGE,
      MARGIN,
    )
    expect(standing.where).toBe('below')
    expect(standing.at.y + SIZE.height / 2).toBeLessThanOrEqual(view.bottom)
  })

  test('a thing half scrolled off is marked only where it shows', () => {
    const standing = stand(
      found({ box: box(300, 700, 700, 900) }),
      SIZE,
      PAGE,
      MARGIN,
    )
    expect(standing.where).toBe('in view')
    expect(standing.mark?.box).toEqual(box(300, 700, 700, 800))
    expect(standing.at.y + SIZE.height / 2).toBeLessThanOrEqual(VIEW.bottom)
  })

  test('folded away, it points at what holds it, whole', () => {
    const holder = box(300, 100, 520, 124)
    const standing = stand(
      found({ box: holder, closed: true }),
      SIZE,
      PAGE,
      MARGIN,
    )
    expect(standing.where).toBe('closed')
    expect(standing.mark).toEqual({ box: holder, kind: 'whole' })
    expect(over(standing.at, holder)).toBe(false)
  })
})

describe('what the agent is told', () => {
  const card = box(300, 100, 700, 160)

  test('nothing, when the thing is simply there', () => {
    expect(
      noteOf({ thing: 'tool:a' }, found({ box: card }), 'in view'),
    ).toEqual([])
    expect(
      noteOf(
        { thing: 'tool:a', text: 'exit 1' },
        found({ box: card, part: card, partKind: 'text' }),
        'in view',
      ),
    ).toEqual([])
  })

  test('that it is folded away, that a part was not found, and which way it lies', () => {
    const [folded] = noteOf(
      { thing: 'tool:a' },
      found({ box: card, closed: true }),
      'closed',
    )
    expect(folded).toContain('folded away')
    const [words] = noteOf(
      { thing: 'tool:a', text: 'exit 1' },
      found({ box: card }),
      'in view',
    )
    expect(words).toContain('not found')
    const [line] = noteOf(
      { thing: 'change:d/a.ts', line: 12 },
      found({ box: card, name: 'change:d/a.ts' }),
      'in view',
    )
    expect(line).toContain('no line 12')
    const notes = noteOf(
      { thing: 'tool:a', text: 'exit 1' },
      found({ box: card }),
      'below',
    )
    expect(notes).toHaveLength(2)
    expect(notes[1]).toContain('below')
  })
})
