import { beforeAll, describe, expect, test } from 'bun:test'
import { STEP, loadRapier } from '@/lib/kit/physics'
import { BODY, FaceBody, releaseVelocity, tetherRate } from './body'
import type { Bump, Point } from './body'

let rapier: Awaited<ReturnType<typeof loadRapier>>
beforeAll(async () => {
  rapier = await loadRapier()
})

const SIZE = { width: 64, height: 41 }

/** A body at `at` in a 1200 by 800 window with an 8 pixel margin. */
function bodyAt(at: Point) {
  const body = new FaceBody(rapier, at, SIZE)
  body.bounds(1200, 800, 8)
  return body
}

/** Runs frames of a sixtieth until the body rests or `seconds` pass. */
function run(body: FaceBody, seconds: number, each?: (at: Point) => void) {
  const bumps: Array<Bump> = []
  let landed: Point | undefined
  let elapsed = 0
  for (; elapsed < seconds; elapsed += STEP) {
    const out = body.advance(STEP)
    bumps.push(...out.bumps)
    landed = out.landed ?? landed
    each?.(body.position())
    if (body.state === 'resting') break
  }
  return { bumps, landed, elapsed }
}

const gap = (one: Point, two: Point) => Math.hypot(one.x - two.x, one.y - two.y)

describe('travel', () => {
  test('it goes to where it is anchored and rests exactly there', () => {
    const body = bodyAt({ x: 100, y: 600 })
    const to = { x: 700, y: 300 }
    body.anchor(to, 620)
    expect(body.state).toBe('tethered')
    let furthest = 0
    const { elapsed } = run(body, 4, (at) => {
      furthest = Math.max(furthest, at.x)
    })
    expect(body.state).toBe('resting')
    expect(body.position()).toEqual(to)
    // One small overshoot: it settles, it does not ring.
    expect(furthest).toBeGreaterThan(to.x)
    expect(furthest - to.x).toBeLessThan(600 * 0.05)
    expect(elapsed).toBeLessThan(2)
  })

  test('a move meant to be quick gets there sooner', () => {
    const near = (over: number) => {
      const body = bodyAt({ x: 100, y: 400 })
      body.anchor({ x: 600, y: 400 }, over)
      let at = 0
      for (; at < 4; at += STEP) {
        body.advance(STEP)
        if (gap(body.position(), { x: 600, y: 400 }) < 5) break
      }
      return at
    }
    expect(tetherRate(200)).toBeGreaterThan(tetherRate(900))
    expect(near(200)).toBeLessThan(near(900))
  })

  test('an anchor where it already is moves nothing', () => {
    const body = bodyAt({ x: 300, y: 300 })
    body.anchor({ x: 300, y: 300 }, 400)
    expect(body.state).toBe('resting')
    expect(body.advance(1).bumps).toEqual([])
    expect(body.position()).toEqual({ x: 300, y: 300 })
  })

  test('an anchor that keeps moving is chased', () => {
    const body = bodyAt({ x: 200, y: 400 })
    for (let frame = 0; frame < 120; frame++) {
      body.anchor({ x: 200 + frame * 4, y: 400 })
      body.advance(STEP)
    }
    const at = body.position()
    expect(at.x).toBeGreaterThan(400)
    expect(at.x).toBeLessThan(200 + 120 * 4)
    expect(Number.isFinite(at.y)).toBe(true)
  })
})

describe('the layout', () => {
  test('a page that scrolls under a resting body carries it and throws nothing', () => {
    const body = bodyAt({ x: 300, y: 500 })
    body.shift(0, -180)
    expect(body.state).toBe('resting')
    expect(body.position()).toEqual({ x: 300, y: 320 })
    expect(body.velocity()).toEqual({ x: 0, y: 0 })
  })

  test('a shift in the middle of a move adds no speed', () => {
    const still = bodyAt({ x: 100, y: 600 })
    const moved = bodyAt({ x: 100, y: 600 })
    still.anchor({ x: 700, y: 600 }, 620)
    moved.anchor({ x: 700, y: 600 }, 620)
    for (let frame = 0; frame < 12; frame++) {
      still.advance(STEP)
      moved.advance(STEP)
    }
    moved.shift(0, -240)
    expect(moved.velocity().x).toBeCloseTo(still.velocity().x, 4)
    expect(moved.velocity().y).toBeCloseTo(still.velocity().y, 4)
    expect(moved.position().y).toBeCloseTo(still.position().y - 240, 4)
    run(still, 4)
    run(moved, 4)
    expect(moved.position()).toEqual({ x: 700, y: 360 })
    expect(still.position()).toEqual({ x: 700, y: 600 })
  })
})

describe('the hand', () => {
  test('held, it is where the hand is and no travel moves it', () => {
    const body = bodyAt({ x: 300, y: 300 })
    body.hold({ x: 420, y: 310 })
    body.anchor({ x: 900, y: 700 }, 300)
    body.advance(0.5)
    expect(body.state).toBe('held')
    expect(body.position()).toEqual({ x: 420, y: 310 })
  })

  test('let go slowly, it is put down where it is', () => {
    const body = bodyAt({ x: 300, y: 300 })
    body.hold({ x: 500, y: 350 })
    expect(body.release({ x: 60, y: 20 })).toBe(false)
    expect(body.state).toBe('resting')
    expect(body.position()).toEqual({ x: 500, y: 350 })
  })

  test('let go moving, it carries on a little way and settles', () => {
    const body = bodyAt({ x: 300, y: 400 })
    body.hold({ x: 400, y: 400 })
    expect(body.release({ x: 600, y: 0 })).toBe(true)
    expect(body.state).toBe('coasting')
    const { landed, bumps, elapsed } = run(body, 6)
    expect(body.state).toBe('resting')
    expect(bumps).toEqual([])
    if (!landed) throw new Error('never landed')
    expect(body.position()).toEqual(landed)
    // Restrained: it goes on, and not far.
    expect(landed.x - 400).toBeGreaterThan(60)
    expect(landed.x - 400).toBeLessThan(260)
    expect(landed.y).toBeCloseTo(400, 3)
    expect(elapsed).toBeLessThan(2.5)
  })

  test('a throw is never faster than a throw may be', () => {
    const body = bodyAt({ x: 600, y: 400 })
    body.hold({ x: 600, y: 400 })
    body.release({ x: 90_000, y: 0 })
    expect(Math.hypot(body.velocity().x, body.velocity().y)).toBeCloseTo(
      BODY.throwAt,
      3,
    )
  })

  test('thrown at an edge, it bumps, comes back off it and stays on the page', () => {
    const body = bodyAt({ x: 1000, y: 400 })
    body.hold({ x: 1000, y: 400 })
    body.release({ x: 1400, y: 0 })
    let rightmost = 0
    const { bumps, landed } = run(body, 6, (at) => {
      rightmost = Math.max(rightmost, at.x)
    })
    expect(bumps).toHaveLength(1)
    expect(bumps[0]?.side).toBe('right')
    expect(bumps[0]?.speed).toBeGreaterThan(300)
    expect(bumps[0]?.speed).toBeLessThan(1400)
    // Its right edge never passes the margin by more than a pixel.
    expect(rightmost + SIZE.width / 2).toBeLessThan(1200 - 8 + 1)
    if (!landed) throw new Error('never landed')
    expect(landed.x).toBeLessThan(rightmost - 10)
  })

  test('travel asked for after a throw takes it from where it is', () => {
    const body = bodyAt({ x: 300, y: 400 })
    body.hold({ x: 300, y: 400 })
    body.release({ x: 500, y: 0 })
    for (let frame = 0; frame < 6; frame++) body.advance(STEP)
    body.anchor({ x: 200, y: 200 }, 500)
    run(body, 4)
    expect(body.position()).toEqual({ x: 200, y: 200 })
  })
})

describe('a poke', () => {
  test('it recoils a little and comes back to exactly where it was', () => {
    const body = bodyAt({ x: 500, y: 400 })
    body.nudge({ x: 0, y: 220 })
    expect(body.state).toBe('tethered')
    let furthest = 0
    run(body, 4, (at) => {
      furthest = Math.max(furthest, gap(at, { x: 500, y: 400 }))
    })
    expect(furthest).toBeGreaterThan(3)
    expect(furthest).toBeLessThan(24)
    expect(body.state).toBe('resting')
    expect(body.position()).toEqual({ x: 500, y: 400 })
  })
})

describe('time', () => {
  test('a frame that took ten seconds is caught up by a few steps, not all of them', () => {
    const long = bodyAt({ x: 100, y: 400 })
    const short = bodyAt({ x: 100, y: 400 })
    long.anchor({ x: 900, y: 400 }, 620)
    short.anchor({ x: 900, y: 400 }, 620)
    long.advance(10)
    for (let step = 0; step < BODY.catchUp; step++) short.advance(STEP)
    expect(long.state).toBe('tethered')
    expect(long.position().x).toBeLessThan(900)
    expect(gap(long.position(), short.position())).toBeLessThan(
      Math.abs(short.velocity().x) * STEP,
    )
  })

  test('between two steps it is drawn between them', () => {
    const body = bodyAt({ x: 100, y: 400 })
    body.anchor({ x: 900, y: 400 }, 620)
    for (let frame = 0; frame < 10; frame++) body.advance(STEP)
    const at = body.position().x
    body.advance(STEP * 0.5)
    const half = body.position().x
    body.advance(STEP * 0.5)
    const whole = body.position().x
    expect(half).toBeGreaterThan(at)
    expect(half).toBeLessThan(whole)
  })
})

describe('the release', () => {
  const moving = (speed: number, until = 1000) =>
    [0, 1, 2, 3, 4, 5, 6].map((index) => ({
      at: until - (6 - index) * 16,
      x: (index * 16 * speed) / 1000,
      y: 0,
    }))

  test('a hand that was moving gives its velocity', () => {
    const v = releaseVelocity(moving(500), 1000)
    expect(v.x).toBeCloseTo(500, 0)
    expect(v.y).toBe(0)
  })

  test('a hand that stopped before it let go gives none', () => {
    expect(releaseVelocity(moving(500, 800), 1000)).toEqual({ x: 0, y: 0 })
  })

  test('one sample, or none, gives none', () => {
    expect(releaseVelocity([], 1000)).toEqual({ x: 0, y: 0 })
    expect(releaseVelocity([{ at: 999, x: 3, y: 4 }], 1000)).toEqual({
      x: 0,
      y: 0,
    })
  })

  test('on a page that hands the hand over ten times a second, a moving hand still throws and a stopped one does not', () => {
    const slow = (until: number) =>
      [0, 1, 2, 3].map((index) => ({
        at: until - (3 - index) * 100,
        x: index * 60,
        y: 0,
      }))
    const v = releaseVelocity(slow(1000), 1040)
    expect(v.x).toBeCloseTo(600, 0)
    expect(releaseVelocity(slow(1000), 1140).x).toBeCloseTo(600, 0)
    expect(releaseVelocity(slow(1000), 1200)).toEqual({ x: 0, y: 0 })
    // A long gap before the last place is the hand having stopped, however late the frame.
    expect(
      releaseVelocity(
        [
          { at: 0, x: 0, y: 0 },
          { at: 600, x: 300, y: 0 },
        ],
        620,
      ),
    ).toEqual({ x: 0, y: 0 })
  })

  test('a flick is capped', () => {
    const v = releaseVelocity(moving(9000), 1000)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(BODY.throwAt, 3)
  })
})

describe('the edges', () => {
  test('travel to a place beside an edge settles there without a bump', () => {
    const body = bodyAt({ x: 800, y: 400 })
    // Flush against the left margin: half its width in from it.
    const to = { x: 8 + SIZE.width / 2, y: 400 }
    body.anchor(to, 620)
    const { bumps } = run(body, 4)
    expect(bumps).toEqual([])
    expect(body.position()).toEqual(to)
  })
})
