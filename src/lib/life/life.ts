// SOURCING: hand-rolled. The npm Life packages are unmaintained and model only alive/dead; this field also carries each cell's age and a fading ghost after death, which the renderer reads for glyph choice
import type { Cells } from './patterns'

/** How many generations a dead cell keeps a fading trace. */
export const GHOST_FRAMES = 6

/**
 * A Conway field on a cylinder: the sides wrap, the top and bottom are edges,
 * so what leaves the bottom never reappears at the top. `age` counts the generations a cell has been alive
 * (0 is dead); `ghost` counts down from GHOST_FRAMES after a cell dies. A cell
 * is never alive and a ghost at once.
 */
export interface Field {
  readonly cols: number
  readonly rows: number
  readonly age: Uint16Array
  readonly ghost: Uint8Array
  readonly generation: number
}

export function createField(cols: number, rows: number): Field {
  const size = cols * rows
  return {
    cols,
    rows,
    age: new Uint16Array(size),
    ghost: new Uint8Array(size),
    generation: 0,
  }
}

const wrap = (value: number, size: number) => ((value % size) + size) % size

/** The cell at (x, y), or undefined above or below the field. */
const index = (field: Field, x: number, y: number) =>
  y < 0 || y >= field.rows ? undefined : y * field.cols + wrap(x, field.cols)

/** Typed arrays read past their end as undefined; every cell outside the field is empty. */
const read = (cells: Uint16Array | Uint8Array, i: number) => cells[i] ?? 0

export const ageAt = (field: Field, i: number) => read(field.age, i)
export const ghostAt = (field: Field, i: number) => read(field.ghost, i)

export function alive(field: Field, x: number, y: number) {
  const i = index(field, x, y)
  return i !== undefined && ageAt(field, i) > 0
}

export function population(field: Field) {
  let count = 0
  for (const age of field.age) if (age > 0) count++
  return count
}

/** One generation under B3/S23. Rows beyond the top and bottom count as empty. */
export function step(field: Field): Field {
  const { cols, rows } = field
  const next = createField(cols, rows)
  // Past the edge rows the index runs off the array, where every cell reads empty.
  const on = (i: number) => +(i >= 0 && ageAt(field, i) > 0)
  const outside = -cols - 1
  for (let y = 0; y < rows; y++) {
    const up = y === 0 ? outside : (y - 1) * cols
    const here = y * cols
    const down = y === rows - 1 ? field.age.length : (y + 1) * cols
    for (let x = 0; x < cols; x++) {
      const left = wrap(x - 1, cols)
      const right = wrap(x + 1, cols)
      const neighbours =
        on(up + left) +
        on(up + x) +
        on(up + right) +
        on(here + left) +
        on(here + right) +
        on(down + left) +
        on(down + x) +
        on(down + right)
      const i = here + x
      const was = ageAt(field, i)
      if (neighbours === 3 || (was > 0 && neighbours === 2))
        next.age[i] = Math.min(was + 1, 0xffff)
      else
        next.ghost[i] =
          was > 0 ? GHOST_FRAMES : Math.max(ghostAt(field, i) - 1, 0)
    }
  }
  return { ...next, generation: field.generation + 1 }
}

const edit = (field: Field, change: (next: Field) => void): Field => {
  const next = {
    ...field,
    age: field.age.slice(),
    ghost: field.ghost.slice(),
  }
  change(next)
  return next
}

const set = (field: Field, i: number, on: boolean) => {
  field.age[i] = on ? Math.max(ageAt(field, i), 1) : 0
  field.ghost[i] = 0
}

export const paint = (field: Field, x: number, y: number, on: boolean) =>
  edit(field, (next) => {
    const i = index(next, x, y)
    if (i !== undefined) set(next, i, on)
  })

/**
 * Paint the complete segment in one immutable field edit. A pointer event can
 * cross many cells; copying the typed arrays per cell would make long strokes
 * unnecessarily expensive. Column wrapping and vertical clipping are the
 * same as for paint().
 */
export function paintLine(
  field: Field,
  from: Readonly<{ x: number; y: number }>,
  to: Readonly<{ x: number; y: number }>,
  on: boolean,
): Field {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1)
  return edit(field, (next) => {
    for (let n = 0; n <= steps; n++) {
      const x = Math.round(from.x + ((to.x - from.x) * n) / steps)
      const y = Math.round(from.y + ((to.y - from.y) * n) / steps)
      const i = index(next, x, y)
      if (i !== undefined) set(next, i, on)
    }
  })
}

/** Brings the pattern to life centred on (x, y). */
export function stamp(field: Field, cells: Cells, x: number, y: number) {
  const width = Math.max(...cells.map(([cx]) => cx)) + 1
  const height = Math.max(...cells.map(([, cy]) => cy)) + 1
  const left = x - Math.floor(width / 2)
  const top = y - Math.floor(height / 2)
  return edit(field, (next) => {
    for (const [cx, cy] of cells) {
      const i = index(next, left + cx, top + cy)
      if (i !== undefined) set(next, i, true)
    }
  })
}

/** A new size with the old field centred in it; cells that no longer fit are dropped. */
export function resize(field: Field, cols: number, rows: number): Field {
  const next = createField(cols, rows)
  const dx = Math.floor((cols - field.cols) / 2)
  const dy = Math.floor((rows - field.rows) / 2)
  for (let y = 0; y < field.rows; y++)
    for (let x = 0; x < field.cols; x++) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      next.age[ny * cols + nx] = ageAt(field, y * field.cols + x)
      next.ghost[ny * cols + nx] = ghostAt(field, y * field.cols + x)
    }
  return { ...next, generation: field.generation }
}

export const randomize = (
  field: Field,
  density: number,
  random: () => number,
) =>
  edit(field, (next) => {
    for (let i = 0; i < next.age.length; i++) set(next, i, random() < density)
  })

/** Brings cells to life at random, in each row about the share its density gives. */
export const sprinkle = (
  field: Field,
  densityAt: (y: number) => number,
  random: () => number,
) =>
  edit(field, (next) => {
    for (let y = 0; y < next.rows; y++) {
      const density = densityAt(y)
      if (density <= 0) continue
      for (let i = y * next.cols; i < (y + 1) * next.cols; i++)
        if (random() < density) set(next, i, true)
    }
  })

/** Each living cell dies with the chance its row gives, leaving a ghost as a natural death does. */
export const erode = (
  field: Field,
  chanceAt: (y: number) => number,
  random: () => number,
) =>
  edit(field, (next) => {
    for (let y = 0; y < next.rows; y++) {
      const chance = chanceAt(y)
      if (chance <= 0) continue
      for (let i = y * next.cols; i < (y + 1) * next.cols; i++)
        if (ageAt(next, i) > 0 && random() < chance) {
          next.age[i] = 0
          next.ghost[i] = GHOST_FRAMES
        }
    }
  })

export const clear = (field: Field): Field => ({
  ...createField(field.cols, field.rows),
  generation: field.generation,
})
