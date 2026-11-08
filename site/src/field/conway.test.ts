import { describe, expect, test } from 'bun:test'
import { createField, step } from '@life/life'
import { createConway } from './conway'

const COLS = 180
const ROWS = 112

/** The field the target describes, to run the rule on independently. */
const fieldFrom = (target: Float32Array) => {
  const field = createField(COLS, ROWS)
  target.forEach((alive, i) => {
    if (alive) field.age[i] = 1
  })
  return field
}

describe('the field', () => {
  test('is Conway Life: each generation is B3/S23 of the last, apart from a new colony now and then', () => {
    const sim = createConway(COLS, ROWS, 7)
    let exact = 0
    let total = 0
    // Under the age at which ash starts to clear, so the rule is all there is.
    for (let n = 0; n < 80; n++) {
      const expected = step(fieldFrom(sim.target))
      sim.tick()
      let different = 0
      sim.target.forEach((alive, i) => {
        if (+(alive > 0) !== +((expected.age[i] ?? 0) > 0)) different++
      })
      total++
      if (different === 0) exact++
      // A new colony fits in a small patch; anything larger is not the rule.
      expect(different).toBeLessThan(26)
    }
    expect(exact / total).toBeGreaterThan(0.8)
  })

  test('grows and renews itself, and neither empties nor floods', () => {
    const sim = createConway(COLS, ROWS, 11)
    const cells = COLS * ROWS
    const seen: number[] = []
    for (let n = 0; n < 3000; n++) {
      sim.tick()
      seen.push(sim.target.reduce((sum, alive) => sum + alive, 0))
    }
    const start = seen[0] ?? 0
    expect(Math.max(...seen.slice(0, 200))).toBeGreaterThan(start * 1.5)
    expect(Math.min(...seen.slice(200))).toBeGreaterThan(0)
    expect(Math.max(...seen)).toBeLessThan(cells * 0.09)
    // Thousands of generations: it takes its time on a busy machine, and that is not what this claims.
  }, 60_000)

  test('two seeds are two different fields', () => {
    const a = createConway(COLS, ROWS, 1)
    const b = createConway(COLS, ROWS, 2)
    for (let n = 0; n < 40; n++) {
      a.tick()
      b.tick()
    }
    expect(a.target).not.toEqual(b.target)
  })

  test('painted cells are ordinary cells: the next generation is the rule applied to them', () => {
    const sim = createConway(COLS, ROWS, 3)
    sim.paint([
      [90, 56],
      [91, 56],
      [92, 56],
    ])
    expect(sim.target[56 * COLS + 91]).toBe(1)
    const expected = step(fieldFrom(sim.target))
    sim.tick()
    let different = 0
    sim.target.forEach((alive, i) => {
      if (+(alive > 0) !== +((expected.age[i] ?? 0) > 0)) different++
    })
    expect(different).toBeLessThan(26)
  })
})
