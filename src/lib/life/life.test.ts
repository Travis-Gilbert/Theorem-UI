import { describe, expect, spyOn, test } from 'bun:test'
import {
  GHOST_FRAMES,
  alive,
  clear,
  createField,
  paint,
  paintLine,
  population,
  randomize,
  resize,
  stamp,
  step,
} from './life'
import { PATTERNS, parsePattern } from './patterns'

const living = (field: ReturnType<typeof createField>) => {
  const cells: Array<[number, number]> = []
  for (let y = 0; y < field.rows; y++)
    for (let x = 0; x < field.cols; x++)
      if (alive(field, x, y)) cells.push([x, y])
  return cells
}

const withCells = (
  cols: number,
  rows: number,
  cells: Array<[number, number]>,
) =>
  cells.reduce(
    (field, [x, y]) => paint(field, x, y, true),
    createField(cols, rows),
  )

describe('step', () => {
  test('a blinker flips between a row and a column', () => {
    const row = withCells(5, 5, [
      [1, 2],
      [2, 2],
      [3, 2],
    ])
    const column = step(row)
    expect(living(column)).toEqual([
      [2, 1],
      [2, 2],
      [2, 3],
    ])
    expect(living(step(column))).toEqual([
      [1, 2],
      [2, 2],
      [3, 2],
    ])
    expect(column.generation).toBe(1)
  })

  test('a block survives and its cells age', () => {
    const block = withCells(4, 4, [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ])
    const later = step(step(block))
    expect(living(later)).toEqual(living(block))
    expect(later.age[1 * 4 + 1]).toBe(3)
  })

  test('a cell that dies leaves a ghost that fades out', () => {
    const lonely = withCells(5, 5, [[2, 2]])
    const after = step(lonely)
    expect(alive(after, 2, 2)).toBe(false)
    expect(after.ghost[2 * 5 + 2]).toBe(GHOST_FRAMES)
    let field = after
    for (let i = 0; i < GHOST_FRAMES; i++) field = step(field)
    expect(field.ghost[2 * 5 + 2]).toBe(0)
  })

  test('the sides wrap, so a spaceship crossing them keeps its nine cells', () => {
    let field = stamp(createField(10, 9), PATTERNS.lwss.cells, 7, 4)
    for (let i = 0; i < 20; i++) field = step(field)
    expect(population(field)).toBe(9)
  })

  test('the bottom does not wrap to the top, so what falls off it never lands up there', () => {
    let field = stamp(createField(8, 12), PATTERNS.glider.cells, 4, 9)
    for (let i = 0; i < 16; i++) field = step(field)
    expect(living(field).filter(([, y]) => y < 4)).toEqual([])
  })

  test('does not change the field it was given', () => {
    const row = withCells(5, 5, [
      [1, 2],
      [2, 2],
      [3, 2],
    ])
    step(row)
    expect(living(row)).toEqual([
      [1, 2],
      [2, 2],
      [3, 2],
    ])
  })
})

describe('paint', () => {
  test('wraps across the sides and ignores rows outside the field', () => {
    expect(alive(paint(createField(4, 4), -1, 1, true), 3, 1)).toBe(true)
    expect(population(paint(createField(4, 4), 1, 4, true))).toBe(0)
  })

  test('erasing clears the age and leaves no ghost', () => {
    const field = paint(paint(createField(3, 3), 1, 1, true), 1, 1, false)
    expect(alive(field, 1, 1)).toBe(false)
    expect(field.ghost[4]).toBe(0)
  })
})

describe('stamp', () => {
  test('centres the pattern on the point', () => {
    const field = stamp(createField(9, 9), PATTERNS.blinker.cells, 4, 4)
    expect(living(field)).toEqual([
      [3, 4],
      [4, 4],
      [5, 4],
    ])
  })
})

describe('resize', () => {
  test('keeps living cells centred in the new size', () => {
    const field = resize(withCells(5, 5, [[2, 2]]), 9, 7)
    expect(living(field)).toEqual([[4, 3]])
    expect([field.cols, field.rows]).toEqual([9, 7])
  })
})

describe('randomize and clear', () => {
  test('fills about the requested share of cells, then clear empties them', () => {
    let seed = 1
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const field = randomize(createField(100, 100), 0.25, random)
    const share = population(field) / 10_000
    expect(share).toBeGreaterThan(0.2)
    expect(share).toBeLessThan(0.3)
    expect(population(clear(field))).toBe(0)
    expect(clear(field).generation).toBe(field.generation)
  })
})

describe('parsePattern', () => {
  test('reads O as alive and anything else as dead', () => {
    expect(parsePattern(['.O.', '..O', 'OOO'])).toEqual({
      width: 3,
      height: 3,
      cells: [
        [1, 0],
        [2, 1],
        [0, 2],
        [1, 2],
        [2, 2],
      ],
    })
  })

  test('the gosper gun keeps firing gliders', () => {
    let field = stamp(createField(80, 50), PATTERNS.gun.cells, 30, 20)
    const start = population(field)
    for (let i = 0; i < 120; i++) field = step(field)
    expect(population(field)).toBeGreaterThan(start + 15)
  })
})

describe('paintLine', () => {
  test('paints/erases an entire segment in one copy of each typed array', () => {
    const initial = createField(24, 12)
    const ages = spyOn(Uint16Array.prototype, 'slice')
    const ghosts = spyOn(Uint8Array.prototype, 'slice')
    try {
      const line = paintLine(initial, { x: 2, y: 4 }, { x: 20, y: 4 }, true)
      expect(ages).toHaveBeenCalledTimes(1)
      expect(ghosts).toHaveBeenCalledTimes(1)
      expect(population(initial)).toBe(0)
      expect(population(line)).toBe(19)
      expect(line.age).not.toBe(initial.age)
      expect(line.ghost).not.toBe(initial.ghost)
      expect(line.generation).toBe(initial.generation)

      const erased = paintLine(line, { x: 2, y: 4 }, { x: 20, y: 4 }, false)
      expect(ages).toHaveBeenCalledTimes(2)
      expect(ghosts).toHaveBeenCalledTimes(2)
      expect(population(erased)).toBe(0)
      expect(population(line)).toBe(19)
    } finally {
      ages.mockRestore()
      ghosts.mockRestore()
    }
  })

  test('interpolates diagonals, wraps columns, and clips off-field rows', () => {
    const line = paintLine(
      createField(4, 5),
      { x: -1, y: 0 },
      { x: 3, y: 4 },
      true,
    )
    expect(living(line)).toEqual([
      [3, 0],
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ])
    const clipped = paintLine(
      createField(4, 3),
      { x: 0, y: -2 },
      { x: 0, y: 4 },
      true,
    )
    expect(living(clipped)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ])
  })
})
