// SOURCING: bun:test; lib/face/feel's own bounds, and what a change of feel does to the body (Rapier itself, through lib/kit/physics's loader) and to the face.
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { STEP, loadRapier } from '@/lib/kit/physics'
import { useFigures } from '@/lib/figures'
import { FaceBody, tetherRate } from './body'
import type { Point } from './body'
import { Face } from './engine'
import {
  FEEL,
  FEEL_REST,
  FEEL_SPECS,
  feelRevision,
  feelValue,
  tune,
} from './feel'
import type { Feel } from './feel'

let rapier: Awaited<ReturnType<typeof loadRapier>>
beforeAll(async () => {
  rapier = await loadRapier()
})
afterEach(() => {
  useFigures.getState().resetFeel()
})

const SIZE = { width: 64, height: 41 }

function bodyAt(at: Point) {
  const body = new FaceBody(rapier, at, SIZE)
  body.bounds(1200, 800, 8)
  return body
}

/** Runs frames of a sixtieth until the body rests or `seconds` pass; says how far right it got and how long it took. */
function run(body: FaceBody, seconds: number) {
  let furthest = -Infinity
  let elapsed = 0
  let bumps = 0
  for (; elapsed < seconds; elapsed += STEP) {
    bumps += body.advance(STEP).bumps.length
    furthest = Math.max(furthest, body.position().x)
    if (body.state === 'resting') break
  }
  return { furthest, elapsed, bumps }
}

/** A throw to the right at 600 pixels a second from the middle of the window: how far it carries. */
function coast() {
  const body = bodyAt({ x: 300, y: 400 })
  body.hold({ x: 300, y: 400 })
  body.release({ x: 600, y: 0 })
  run(body, 6)
  return body.position().x - 300
}

/** A trip of 500 pixels to the right: how long it takes and how far past it swings. */
function trip() {
  const body = bodyAt({ x: 100, y: 400 })
  body.anchor({ x: 600, y: 400 }, 620)
  const { furthest, elapsed } = run(body, 8)
  return { elapsed, past: furthest - 600, at: body.position() }
}

describe('the feel', () => {
  test('every setting ships inside its own bounds, on a step', () => {
    for (const { key, min, max, step, rest } of FEEL_SPECS) {
      expect(min).toBeLessThan(max)
      expect(rest).toBeGreaterThanOrEqual(min)
      expect(rest).toBeLessThanOrEqual(max)
      expect(step).toBeGreaterThan(0)
      expect(FEEL[key]).toBe(rest)
      expect(FEEL_REST[key]).toBe(rest)
    }
    expect(new Set(FEEL_SPECS.map((spec) => spec.key)).size).toBe(
      FEEL_SPECS.length,
    )
  })

  test('a value outside its bounds is brought inside, and what is not a number is refused', () => {
    expect(feelValue('bounce', 4)).toBe(0.9)
    expect(feelValue('bounce', -1)).toBe(0)
    expect(feelValue('drag', 3)).toBe(3)
    expect(feelValue('drag', Number.NaN)).toBeUndefined()
    expect(feelValue('drag', '3')).toBeUndefined()
    expect(feelValue('nothing' as keyof Feel, 1)).toBeUndefined()
  })

  test('tuning lays what is given over what ships, and nothing given is as shipped', () => {
    const before = feelRevision()
    tune({ drag: 2, bounce: 'springy', lead: 9_000 })
    expect(FEEL.drag).toBe(2)
    expect(FEEL.bounce).toBe(FEEL_REST.bounce)
    expect(FEEL.lead).toBe(600)
    expect(feelRevision()).toBe(before + 1)
    tune({ drag: 2, lead: 600 })
    expect(feelRevision()).toBe(before + 1)
    tune()
    expect(FEEL).toEqual(FEEL_REST)
    expect(feelRevision()).toBe(before + 2)
  })

  test('the person’s settings are kept as what they changed, and take force as they are set', () => {
    const figures = useFigures.getState()
    expect(figures.feel).toEqual({})
    figures.setFeel('drag', 99)
    figures.setFeel('pace', 1.5)
    figures.setFeel('lean', Number.NaN)
    expect(useFigures.getState().feel).toEqual({ drag: 12, pace: 1.5 })
    expect(FEEL.drag).toBe(12)
    expect(FEEL.pace).toBe(1.5)
    expect(FEEL.lean).toBe(FEEL_REST.lean)
    useFigures.getState().resetFeel()
    expect(useFigures.getState().feel).toEqual({})
    expect(FEEL).toEqual(FEEL_REST)
  })

  test('one setting goes back to what Theo ships with and the others stay', () => {
    const figures = useFigures.getState()
    figures.setFeel('drag', 9)
    figures.setFeel('pace', 1.5)
    useFigures.getState().resetFeel('drag')
    expect(useFigures.getState().feel).toEqual({ pace: 1.5 })
    expect(FEEL.drag).toBe(FEEL_REST.drag)
    expect(FEEL.pace).toBe(1.5)
    useFigures.getState().resetFeel('drag')
    expect(useFigures.getState().feel).toEqual({ pace: 1.5 })
  })
})

describe('what the feel does to the body', () => {
  test('less drag carries a throw further', () => {
    const shipped = coast()
    tune({ drag: 2 })
    const loose = coast()
    tune({ drag: 10 })
    const tight = coast()
    expect(loose).toBeGreaterThan(shipped * 1.5)
    expect(tight).toBeLessThan(shipped * 0.7)
  })

  test('a slower release than the setting is put down, not thrown', () => {
    tune({ throwFrom: 400 })
    const body = bodyAt({ x: 300, y: 400 })
    body.hold({ x: 300, y: 400 })
    expect(body.release({ x: 300, y: 0 })).toBe(false)
    expect(body.state).toBe('resting')
    tune({ throwFrom: 100 })
    body.hold({ x: 300, y: 400 })
    expect(body.release({ x: 300, y: 0 })).toBe(true)
  })

  test('more bounce comes further back off the edge', () => {
    const back = () => {
      const body = bodyAt({ x: 1100, y: 400 })
      body.hold({ x: 1100, y: 400 })
      body.release({ x: 1400, y: 0 })
      run(body, 6)
      return body.position().x
    }
    tune({ bounce: 0 })
    const dead = back()
    tune({ bounce: 0.9 })
    const lively = back()
    expect(lively).toBeLessThan(dead - 20)
  })

  test('pace changes how soon a trip arrives, and the rate with it', () => {
    const shipped = trip()
    const rate = tetherRate(620)
    tune({ pace: 2 })
    expect(tetherRate(620)).toBeCloseTo(rate * 2, 6)
    const brisk = trip()
    tune({ pace: 0.5 })
    const slow = trip()
    expect(brisk.elapsed).toBeLessThan(shipped.elapsed * 0.75)
    expect(slow.elapsed).toBeGreaterThan(shipped.elapsed * 1.4)
  })

  test('a looser settle swings past and still comes to rest on the spot', () => {
    const shipped = trip()
    tune({ settle: 0.3 })
    const loose = trip()
    expect(loose.past).toBeGreaterThan(shipped.past + 20)
    expect(loose.at).toEqual({ x: 600, y: 400 })
  })

  test('a change takes hold of a trip and a coast already under way', () => {
    const body = bodyAt({ x: 100, y: 400 })
    body.anchor({ x: 900, y: 400 }, 620)
    for (let step = 0; step < 6; step++) body.advance(STEP)
    const twin = bodyAt({ x: 100, y: 400 })
    twin.anchor({ x: 900, y: 400 }, 620)
    for (let step = 0; step < 6; step++) twin.advance(STEP)
    expect(twin.position()).toEqual(body.position())
    tune({ pace: 2 })
    for (let step = 0; step < 12; step++) body.advance(STEP)
    tune()
    for (let step = 0; step < 12; step++) twin.advance(STEP)
    expect(body.position().x).toBeGreaterThan(twin.position().x + 30)

    const thrown = bodyAt({ x: 300, y: 400 })
    thrown.hold({ x: 300, y: 400 })
    thrown.release({ x: 600, y: 0 })
    for (let step = 0; step < 3; step++) thrown.advance(STEP)
    tune({ drag: 12 })
    run(thrown, 6)
    const caught = thrown.position().x - 300
    tune()
    expect(caught).toBeLessThan(coast() * 0.8)
  })

  test('with every setting at either end, a trip still arrives and a throw still stays inside', () => {
    for (const end of ['min', 'max'] as const) {
      tune(Object.fromEntries(FEEL_SPECS.map((spec) => [spec.key, spec[end]])))
      const there = trip()
      expect(there.at).toEqual({ x: 600, y: 400 })
      expect(there.elapsed).toBeLessThan(8)

      const body = bodyAt({ x: 1000, y: 400 })
      body.hold({ x: 1000, y: 400 })
      body.release({ x: 1500, y: 900 })
      let inside = true
      for (let elapsed = 0; elapsed < 20; elapsed += STEP) {
        body.advance(STEP)
        const at = body.position()
        if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) inside = false
        if (at.x > 1200 - 8 - SIZE.width / 2 + 2) inside = false
        if (at.y > 800 - 8 - SIZE.height / 2 + 2) inside = false
        if (body.state === 'resting') break
      }
      expect(inside).toBe(true)
      expect(body.state).toBe('resting')
    }
  })
})

describe('what the feel does to the face', () => {
  const theo = () => {
    let now = 1_700_000_000_000
    const face = new Face({ seed: 7, clock: () => now })
    face.attach({
      gazeAt: () => ({ x: 0, y: 0 }),
      go: () => {},
      burst: () => {},
    })
    const pass = (ms: number) => {
      for (let t = 0; t < ms; t += 8) {
        now += 8
        face.advance(0.008)
      }
    }
    /** Tells the face its figure moved at a steady speed, in face units per second, for a while; says how far the visor got from its place. */
    const travel = (vx: number, ms: number) => {
      let lag = 0
      for (let t = 0; t < ms; t += 8) {
        face.sway((vx * 8) / 1000, 0, 0.008)
        pass(8)
        lag = Math.max(lag, Math.abs(face.head().dx))
      }
      return lag
    }
    return { face, run: pass, travel }
  }

  /** The tilt a steady 300 a second to the right settles at. */
  const lean = () => {
    const made = theo()
    made.run(300)
    made.travel(300, 400)
    return made.face.head().tilt
  }

  /** How far the visor is left behind when the figure sets off at 600 a second. */
  const trail = () => {
    const made = theo()
    made.run(300)
    return made.travel(600, 400)
  }

  test('lean scales how far the face tilts into travel, and none is none', () => {
    const shipped = lean()
    expect(shipped).toBeGreaterThan(1)
    expect(shipped).toBeLessThan(8)
    tune({ lean: 2 })
    expect(lean()).toBeCloseTo(shipped * 2, 1)
    tune({ lean: 0 })
    expect(Math.abs(lean())).toBeLessThan(0.05)
  })

  test('trail scales how far the visor is left behind, and none is none', () => {
    const shipped = trail()
    expect(shipped).toBeGreaterThan(0.3)
    expect(shipped).toBeLessThan(2.5)
    tune({ trail: 2 })
    expect(trail()).toBeCloseTo(shipped * 2, 1)
    tune({ trail: 0 })
    expect(trail()).toBeLessThan(0.05)
  })

  test('a quicker recovery gets over a knock sooner', () => {
    const after = () => {
      const made = theo()
      made.run(300)
      made.face.bump('left', 0.8)
      made.face.player.stop('reaction')
      made.run(240)
      return Math.abs(made.face.head().dx)
    }
    tune({ recover: 2 })
    const lingering = after()
    tune({ recover: 20 })
    const quick = after()
    expect(lingering).toBeGreaterThan(1)
    expect(lingering).toBeGreaterThan(quick * 3)
  })

  test('at either end of every setting the lean and the trail keep their bounds', () => {
    for (const end of ['min', 'max'] as const) {
      tune(Object.fromEntries(FEEL_SPECS.map((spec) => [spec.key, spec[end]])))
      const made = theo()
      made.run(300)
      for (let frame = 0; frame < 120; frame++) {
        made.face.sway(frame % 40 < 20 ? 12 : -12, 6, 0.008)
        if (frame === 30) made.face.bump('right', 1)
        made.run(8)
        const head = made.face.head()
        expect(Math.abs(head.tilt)).toBeLessThanOrEqual(40)
        expect(Math.abs(head.dx)).toBeLessThanOrEqual(24)
        expect(
          Number.isFinite(head.tilt + head.dx + head.dy + head.squash),
        ).toBe(true)
      }
    }
  })
})
