// SOURCING: hand-rolled. Where the field lives (soups dropped across the bottom third, gliders launched upward, thinning with height) is Theorem's own look for the backdrop; it is the field's own sprinkle, stamp and erode
import { erode, sprinkle, stamp } from './life'
import type { Field } from './life'
import { parsePattern } from './patterns'

/**
 * Random 4 by 4 soups dropped each generation per column, at rest and at full
 * activity. A soup grows into structures before it settles, where single
 * cells would only flicker and die. They land across the bottom third, more
 * of them low, so the source shows above the composer as well as behind it.
 */
const SOUPS_REST = 0.5 / 96
const SOUPS_BUSY = 1.5 / 96
const SOUP_SIZE = 4
/** Gliders launched upward each generation per column, at rest and at full activity. */
const LAUNCH_REST = 0.1 / 96
const LAUNCH_BUSY = 0.2 / 96
/** The chance a cell dies each generation, just above the bottom third and at the top. */
const THIN_LOW = 0.014
const THIN_HIGH = 0.05
const FILL_DENSITY = 0.18

/** The glider flipped to climb, to the right and to the left. */
const RISING = [parsePattern(['OOO', '..O', '.O.']).cells, parsePattern(['OOO', 'O..', '.O.']).cells] as const

/** The first row of the bottom third, where cells are left alone. */
const bottomThird = (field: Field) => Math.ceil((field.rows * 2) / 3)

const between = (rest: number, busy: number, level: number) => rest + (busy - rest) * level

/** Cells in the bottom third, about FILL_DENSITY of them. */
export function fill(field: Field, random: () => number) {
  const floor = bottomThird(field)
  return sprinkle(field, (y) => (y >= floor ? FILL_DENSITY : 0), random)
}

/** Whole drops, plus one more with the chance of the fraction left over. */
function drops(expected: number, random: () => number) {
  return Math.floor(expected) + (random() < expected % 1 ? 1 : 0)
}

/** Each cell of a SOUP_SIZE square alive at even odds; never empty, since a stamp needs a cell. */
function soup(random: () => number): Array<[number, number]> {
  const cells: Array<[number, number]> = []
  for (let y = 0; y < SOUP_SIZE; y++)
    for (let x = 0; x < SOUP_SIZE; x++) if (random() < 0.5) cells.push([x, y])
  return cells.length > 0 ? cells : [[0, 0]]
}

/**
 * One generation's weather. Soups land in the bottom third, most near the
 * bottom edge, and gliders launch upward, more of both as the model works;
 * cells above the bottom third die off the more often the higher they climb.
 * Tuned so about 80% of living cells stay in the bottom third
 * (emitter.test.ts runs it).
 */
export function emit(field: Field, level: number, random: () => number): Field {
  const { cols, rows } = field
  const floor = bottomThird(field)
  let next = field
  for (let i = drops(between(SOUPS_REST, SOUPS_BUSY, level) * cols, random); i > 0; i--) {
    // Squaring a uniform draw lands more soups near the bottom edge.
    const y = rows - 1 - Math.floor((rows - floor) * random() ** 2)
    next = stamp(next, soup(random), Math.floor(random() * cols), y)
  }
  for (let i = drops(between(LAUNCH_REST, LAUNCH_BUSY, level) * cols, random); i > 0; i--)
    next = stamp(next, RISING[random() < 0.5 ? 0 : 1], Math.floor(random() * cols), floor - 2)
  return erode(
    next,
    (y) => (y >= floor ? 0 : between(THIN_LOW, THIN_HIGH, (floor - y) / floor)),
    random,
  )
}
