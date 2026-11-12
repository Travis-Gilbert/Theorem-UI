// SOURCING: bun:test; components/face/plate's own geometry (the plate as a rounded box that is a ball when drawn in), checked as numbers, and what it writes to the element behind the matter, checked on a plain object standing in for one.
import { describe, expect, test } from 'bun:test'
import { THEO } from '@/lib/face/identity'
import { CORNER, PlateMotion, RIM, offPlate, plateOf } from './plate'

const W = THEO.width
const H = THEO.height
const ball = { x: 0, y: 0, r: 12 }

describe('the plate’s outline', () => {
  test('with no ball, or none of the way to one, it is the whole visor', () => {
    const whole = { x: 0, y: 0, hw: W / 2, hh: H / 2, corner: W * CORNER }
    expect(plateOf(W, H, undefined, 1)).toEqual(whole)
    expect(plateOf(W, H, ball, 0)).toEqual(whole)
  })

  test('drawn in, it is a ball round the orb, a rim wider than it', () => {
    const drawn = plateOf(W, H, { x: 4, y: -3, r: 12 }, 1)
    expect(drawn).toEqual({
      x: 4,
      y: -3,
      hw: 12 + RIM,
      hh: 12 + RIM,
      corner: 12 + RIM,
    })
  })

  test('part of the way, it is between the two', () => {
    const half = plateOf(W, H, ball, 0.5)
    expect(half.hw).toBeCloseTo((W / 2 + 12 + RIM) / 2)
    expect(half.hh).toBeCloseTo((H / 2 + 12 + RIM) / 2)
    expect(half.corner).toBeLessThan(half.hh)
  })

  test('a ball is never taller than the visor', () => {
    const drawn = plateOf(W, H, { x: 0, y: 0, r: 40 }, 1)
    expect(drawn.hh).toBe(H / 2)
    expect(drawn.hw).toBe(H / 2)
  })
})

describe('what is off the plate', () => {
  test('the whole plate holds its middle and its sides, and not its corners', () => {
    const whole = plateOf(W, H, undefined, 0)
    expect(offPlate(whole, 0, 0)).toBeLessThan(0)
    expect(offPlate(whole, W / 2 - 1, 0)).toBeLessThan(0)
    expect(offPlate(whole, 0, H / 2 - 1)).toBeLessThan(0)
    expect(offPlate(whole, W / 2, 0)).toBeCloseTo(0)
    expect(offPlate(whole, W / 2 - 1, H / 2 - 1)).toBeGreaterThan(0)
    expect(offPlate(whole, W / 2 + 5, 0)).toBeCloseTo(5)
  })

  test('drawn in, it is the distance from a circle', () => {
    const drawn = plateOf(W, H, { x: 4, y: -3, r: 12 }, 1)
    const r = 12 + RIM
    expect(offPlate(drawn, 4, -3)).toBeCloseTo(-r)
    expect(offPlate(drawn, 4 + r, -3)).toBeCloseTo(0)
    expect(offPlate(drawn, 4, -3 + r + 2)).toBeCloseTo(2)
    const along = (r + 6) / Math.SQRT2
    expect(offPlate(drawn, 4 + along, -3 + along)).toBeCloseTo(6)
  })
})

describe('the plate from frame to frame', () => {
  /** What `lay` writes to, with nothing else of an element. */
  const element = () =>
    ({ style: { inset: '', borderRadius: '' } }) as unknown as HTMLElement

  test('it draws in while there is a ball, and is whole again after', () => {
    const motion = new PlateMotion(W, H)
    expect(motion.whole).toBe(true)
    motion.step(ball, 0.016)
    expect(motion.whole).toBe(false)
    expect(motion.plate.hw).toBeLessThan(W / 2)
    expect(motion.plate.hw).toBeGreaterThan(12 + RIM)
    for (let frame = 0; frame < 90; frame++) motion.step(ball, 0.016)
    expect(motion.plate).toEqual(plateOf(W, H, ball, 1))
    motion.step(undefined, 0.016)
    expect(motion.whole).toBe(false)
    for (let frame = 0; frame < 90; frame++) motion.step(undefined, 0.016)
    expect(motion.whole).toBe(true)
    expect(motion.plate).toEqual(plateOf(W, H, undefined, 0))
  })

  test('it opens from where the ball was', () => {
    const motion = new PlateMotion(W, H)
    const aside = { x: 10, y: 0, r: 12 }
    for (let frame = 0; frame < 90; frame++) motion.step(aside, 0.016)
    motion.step(undefined, 0.016)
    expect(motion.plate.x).toBeGreaterThan(5)
    expect(motion.plate.x).toBeLessThan(10)
  })

  test('with motion reduced it is there at once, both ways', () => {
    const motion = new PlateMotion(W, H)
    motion.step(ball, 0.016, true)
    expect(motion.plate).toEqual(plateOf(W, H, ball, 1))
    motion.step(undefined, 0.016, true)
    expect(motion.whole).toBe(true)
  })

  test('the element behind the matter is given the ball, and left to its stylesheet when the plate is whole', () => {
    const motion = new PlateMotion(W, H)
    const back = element()
    motion.lay(back, 1.2)
    expect(back.style.inset).toBe('')
    motion.step(ball, 0.016, true)
    motion.lay(back, 1.2)
    const edge = ((H / 2 - 12 - RIM) * 1.2).toFixed(2)
    const side = ((W / 2 - 12 - RIM) * 1.2).toFixed(2)
    expect(back.style.inset).toBe(`${edge}px ${side}px ${edge}px ${side}px`)
    expect(back.style.borderRadius).toBe(`${((12 + RIM) * 1.2).toFixed(2)}px`)
    motion.step(undefined, 0.016, true)
    motion.lay(back, 1.2)
    expect(back.style.inset).toBe('')
    expect(back.style.borderRadius).toBe('')
  })
})
