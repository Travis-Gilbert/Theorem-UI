import { describe, expect, test } from 'bun:test'
import { createField, ageAt, population, step } from './life'
import type { Field } from './life'
import { emit, fill } from './emitter'

/** mulberry32, so a run is the same every time. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const bottomShare = (field: Field) => {
  const from = Math.ceil((field.rows * 2) / 3)
  let low = 0
  for (let i = from * field.cols; i < field.age.length; i++) if (ageAt(field, i) > 0) low++
  return low / Math.max(1, population(field))
}

/** The mean bottom share over a long run, once the opening fill has played out. */
function run(level: number, seed: number) {
  const random = seeded(seed)
  let field = fill(createField(96, 60), random)
  const shares: number[] = []
  let lowest = Infinity
  for (let i = 0; i < 800; i++) {
    field = step(emit(field, level, random))
    if (i >= 200) {
      shares.push(bottomShare(field))
      lowest = Math.min(lowest, population(field))
    }
  }
  return { share: shares.reduce((a, b) => a + b, 0) / shares.length, lowest }
}

describe('emit', () => {
  test('a fresh fill lives only in the bottom third', () => {
    const field = fill(createField(96, 60), seeded(1))
    expect(population(field)).toBeGreaterThan(0)
    expect(bottomShare(field)).toBe(1)
  })

  for (const level of [0, 0.5, 1])
    test(`keeps about 80% of living cells in the bottom third at activity ${level}`, () => {
      for (const seed of [1, 2, 3]) {
        const { share, lowest } = run(level, seed)
        expect(share).toBeGreaterThan(0.74)
        expect(share).toBeLessThan(0.88)
        expect(lowest).toBeGreaterThan(20)
      }
    })

  test('emits more when the model is busy', () => {
    const quiet = emit(createField(96, 60), 0, seeded(4))
    const busy = emit(createField(96, 60), 1, seeded(4))
    expect(population(busy)).toBeGreaterThan(population(quiet))
  })
})
