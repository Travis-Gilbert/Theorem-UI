// SOURCING: @life/life (B3/S23 on a cylinder: createField, step, stamp, resize) and @life/patterns (the R-pentomino and the acorn, methuselahs that grow for hundreds of generations from a handful of cells). The field's own part is when something new starts and how old ash clears, since nothing upstream knows what a backdrop should hold
import { createField, resize, stamp, step } from '@life/life'
import { PATTERNS } from '@life/patterns'
import type { Cells } from '@life/patterns'
import { seeded } from './sim'
import type { Sim } from './sim'

/** One colony to start with per this many cells. */
const AREA_PER_COLONY = 3000
/** The population share below which the field counts as quiet, and above which nothing new starts. */
const QUIET = 0.012
const CEILING = 0.03
/** Chance per generation of a new colony while quiet, and while there is simply room for one. Chance, so they arrive at no particular moment. */
const PLANT_WHEN_QUIET = 0.08
const PLANT_WITH_ROOM = 0.012
/** A soup's side, and the share of its cells that start alive. */
const SOUP_SIZE = 5
const SOUP_ALIVE = 0.45
/** A cell alive this many generations unbroken is ash. It clears a little at a time, and fades like any other death. */
const ASH_AGE = 90
const ASH_CLEARS = 0.012

const bounds = (cells: Cells) => ({
  width: Math.max(...cells.map(([x]) => x)) + 1,
  height: Math.max(...cells.map(([, y]) => y)) + 1,
})
const rotate = (cells: Cells): Cells => {
  const { height } = bounds(cells)
  return cells.map(([x, y]) => [height - 1 - y, x] as const)
}
const mirror = (cells: Cells): Cells => {
  const { width } = bounds(cells)
  return cells.map(([x, y]) => [width - 1 - x, y] as const)
}

/** Real Conway Life from small seeds that grow: nothing steers it, and the drawing path owns the easing. */
export function createConway(cols: number, rows: number, seed: number): Sim {
  const random = seeded(seed)
  let field = createField(cols, rows)
  let target = new Float32Array(cols * rows)

  const refresh = () => {
    for (let i = 0; i < target.length; i++)
      target[i] = (field.age[i] ?? 0) > 0 ? 1 : 0
  }

  /** A pattern in any of its eight orientations. */
  const oriented = (cells: Cells) => {
    let out = random() < 0.5 ? cells : mirror(cells)
    for (let turn = Math.floor(random() * 4); turn > 0; turn--) out = rotate(out)
    return out
  }

  const soup = (): Cells => {
    const cells: Array<readonly [number, number]> = []
    for (let y = 0; y < SOUP_SIZE; y++)
      for (let x = 0; x < SOUP_SIZE; x++)
        if (random() < SOUP_ALIVE) cells.push([x, y])
    return cells.length > 0 ? cells : PATTERNS.rpentomino.cells
  }

  const plantOne = () => {
    const roll = random()
    const cells =
      roll < 0.4
        ? oriented(PATTERNS.rpentomino.cells)
        : roll < 0.6
          ? oriented(PATTERNS.acorn.cells)
          : soup()
    field = stamp(
      field,
      cells,
      Math.floor(random() * field.cols),
      Math.floor(random() * field.rows),
    )
  }

  const plant = (count: number) => {
    for (let n = 0; n < count; n++) plantOne()
    refresh()
  }

  plant(Math.max(2, Math.round((cols * rows) / AREA_PER_COLONY)))

  return {
    get cols() {
      return field.cols
    },
    get rows() {
      return field.rows
    },
    get target() {
      return target
    },
    tick() {
      field = step(field)
      // One pass over the fresh field a step returns: ash clears, and the living are counted.
      let alive = 0
      for (let i = 0; i < field.age.length; i++) {
        let age = field.age[i] ?? 0
        if (age > ASH_AGE && random() < ASH_CLEARS) age = field.age[i] = 0
        if (age > 0) alive++
      }
      const share = alive / (field.cols * field.rows)
      const chance =
        share < QUIET ? PLANT_WHEN_QUIET : share < CEILING ? PLANT_WITH_ROOM : 0
      if (random() < chance) plantOne()
      refresh()
    },
    paint(cells) {
      if (cells.length === 0) return
      // stamp() centres a pattern on a point, so the cells go in as a pattern measured from their own corner.
      const minX = Math.min(...cells.map(([x]) => x))
      const minY = Math.min(...cells.map(([, y]) => y))
      const local = cells.map(([x, y]) => [x - minX, y - minY] as const)
      const { width, height } = bounds(local)
      field = stamp(
        field,
        local,
        minX + Math.floor(width / 2),
        minY + Math.floor(height / 2),
      )
      refresh()
    },
    plant,
    resize(nextCols, nextRows) {
      field = resize(field, nextCols, nextRows)
      target = new Float32Array(nextCols * nextRows)
      refresh()
    },
  }
}
