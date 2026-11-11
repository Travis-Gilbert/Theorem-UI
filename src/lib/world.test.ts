import { beforeAll, describe, expect, test } from 'bun:test'
import { FaceBody } from './face/body'
import type { Bump, Point } from './face/body'
import { KitWorld } from './kit/physics'
import type { Coming } from './kit/physics'
import { standPoint } from './kit/stage'
import type { PerchLine } from './kit/stage'
import {
  FigureWorld,
  PX,
  STEP,
  enterWorld,
  leaveWorld,
  loadRapier,
  theWorld,
} from './world'

const floor: PerchLine = { name: 'floor', left: 0, right: 1200, y: 798 }
const shelf: PerchLine = { name: 'composer', left: 300, right: 900, y: 500 }
const lines = [shelf, floor]
const SIZE = { width: 64, height: 41 }

let rapier: Awaited<ReturnType<typeof loadRapier>>
beforeAll(async () => {
  rapier = await loadRapier()
})

/** Kit standing `at` along `on`, in `world`. */
function kitOn(world: FigureWorld, on: PerchLine, at: number) {
  const kit = new KitWorld(rapier, ...standPoint(on, at), world)
  kit.sync(lines, 1200, 800)
  return kit
}

/** Theo at `at` in a 1200 by 800 window with an 8 pixel margin, in `world`. */
function theoAt(world: FigureWorld | undefined, at: Point) {
  const theo = new FaceBody(rapier, at, SIZE, world)
  theo.bounds(1200, 800, 8)
  return theo
}

/** Lets Theo go from `at`, moving at `velocity` pixels per second. */
function throwFrom(theo: FaceBody, at: Point, velocity: Point) {
  theo.hold(at)
  expect(theo.release(velocity)).toBe(true)
}

/** Runs frames of a sixtieth for `seconds`, or until `until` says so. */
function run(
  theo: FaceBody,
  seconds: number,
  each?: () => boolean | undefined,
) {
  const bumps: Array<Bump> = []
  for (let t = 0; t < seconds; t += STEP) {
    bumps.push(...theo.advance(STEP).bumps)
    if (each?.()) break
  }
  return bumps
}

/** Flies Kit until it rests on a surface or `seconds` pass; where it rests. */
function flyFor(kit: KitWorld, seconds = 6, each?: () => void) {
  for (let t = 0; t < seconds; t += STEP) {
    const { under } = kit.fly()
    each?.()
    if (under !== undefined && Math.abs(kit.velocity().y) < 1.2) return under
  }
  return undefined
}

/** Kit's middle and feet, in pixels. */
const kitAt = (kit: KitWorld) => {
  const [x, y] = kit.frame()
  return { x: x + 16, feet: y + 28 }
}

describe('the two meeting', () => {
  test('a thrown Theo strikes Kit where it stands, comes back off it, and Kit is told how fast it came', () => {
    const world = new FigureWorld(rapier)
    const kit = kitOn(world, floor, 0.5)
    const theo = theoAt(world, { x: 420, y: 770 })
    let struck: { x: number; y: number; airborne: boolean } | undefined
    kit.onStruck = (velocity, airborne) => {
      struck = { ...velocity, airborne }
    }
    throwFrom(theo, { x: 420, y: 770 }, { x: 1200, y: 0 })
    let furthest = 0
    const bumps = run(theo, 3, () => {
      furthest = Math.max(furthest, theo.position().x)
      return theo.state === 'resting'
    })
    const met = bumps.filter((bump) => bump.against === 'kit')
    expect(met).toHaveLength(1)
    expect(met[0]?.side).toBe('right')
    expect(met[0]?.speed).toBeGreaterThan(300)
    // It never got past Kit: its right edge stopped at Kit's left.
    expect(furthest + SIZE.width / 2).toBeLessThan(kitAt(kit).x)
    expect(theo.position().x).toBeLessThan(furthest - 20)
    expect(struck?.airborne).toBe(false)
    // Metres per second, as it was going when it struck.
    expect(struck!.x * PX).toBeGreaterThan(300)
    world.free()
  })

  test('travelling, Theo passes Kit by', () => {
    const world = new FigureWorld(rapier)
    const kit = kitOn(world, floor, 0.5)
    const theo = theoAt(world, { x: 200, y: 770 })
    let struck = false
    kit.onStruck = () => {
      struck = true
    }
    theo.anchor({ x: 1000, y: 770 }, 620)
    const bumps = run(theo, 4, () => theo.state === 'resting')
    expect(theo.position()).toEqual({ x: 1000, y: 770 })
    expect(bumps).toEqual([])
    expect(struck).toBe(false)
    world.free()
  })

  test("Kit's surfaces are not Theo's, nor Theo's edges Kit's", () => {
    const world = new FigureWorld(rapier)
    const kit = kitOn(world, floor, 0.9)
    const theo = theoAt(world, { x: 600, y: 580 })
    // Up through the shelf at 500, which is nothing to it.
    throwFrom(theo, { x: 600, y: 580 }, { x: 0, y: -1400 })
    let highest = 580
    let bumps = run(theo, 3, () => {
      highest = Math.min(highest, theo.position().y)
      return theo.state === 'resting'
    })
    expect(highest).toBeLessThan(400)
    expect(bumps).toEqual([])
    // Down onto its own bottom edge at 792, short of Kit's floor.
    throwFrom(theo, { x: 600, y: 700 }, { x: 0, y: 1400 })
    let lowest = 700
    bumps = run(theo, 3, () => {
      lowest = Math.max(lowest, theo.position().y)
      return theo.state === 'resting'
    })
    expect(bumps.map((bump) => bump.side)).toEqual(['bottom'])
    expect(lowest + SIZE.height / 2).toBeLessThan(793)
    // Kit's feet are on its floor at 798, below where Theo's bottom edge is (792).
    kit.launch({ x: 0, y: -6 }, 0.1)
    expect(flyFor(kit)).toBe('floor')
    expect(kitAt(kit).feet).toBeGreaterThan(795)
    world.free()
  })

  test('Kit, loose in the air, strikes Theo at rest: the tether brings Theo back, and Kit lands on a surface, not on Theo', () => {
    const world = new FigureWorld(rapier)
    const kit = kitOn(world, floor, 0.5)
    const home = { x: 600, y: 700 }
    const theo = theoAt(world, home)
    let struck = 0
    kit.onStruck = () => struck++
    // Straight up into Theo, which is directly over it.
    kit.launch({ x: 0, y: -14 }, 0.3)
    let moved = 0
    const bumps: Array<Bump> = []
    const onto = flyFor(kit, 6, () => {
      bumps.push(...theo.advance(STEP).bumps)
      moved = Math.max(moved, home.y - theo.position().y)
    })
    expect(struck).toBe(1)
    expect(bumps.filter((bump) => bump.against === 'kit')).toHaveLength(1)
    expect(bumps[0]?.side).toBe('bottom')
    expect(moved).toBeGreaterThan(3)
    expect(onto).toBe('floor')
    run(theo, 4, () => theo.state === 'resting')
    expect(theo.state).toBe('resting')
    expect(theo.position()).toEqual(home)
    world.free()
  })

  test('aimed at a surface, Kit passes a resting Theo by', () => {
    const world = new FigureWorld(rapier)
    const kit = kitOn(world, floor, 0.5)
    const theo = theoAt(world, { x: 600, y: 740 })
    let struck = false
    kit.onStruck = () => {
      struck = true
    }
    kit.launch({ x: 0, y: -14 }, 0, 'floor')
    let highest = 798
    const onto = flyFor(kit, 6, () => {
      theo.advance(STEP)
      highest = Math.min(highest, kitAt(kit).feet)
    })
    expect(onto).toBe('floor')
    // It went up through where Theo is, 719 to 761.
    expect(highest).toBeLessThan(719)
    expect(struck).toBe(false)
    expect(theo.state).toBe('resting')
    world.free()
  })

  test('in the hand, Kit is met by nothing until it is put down', () => {
    const world = new FigureWorld(rapier)
    const kit = kitOn(world, floor, 0.5)
    const theo = theoAt(world, { x: 420, y: 770 })
    kit.lift()
    throwFrom(theo, { x: 420, y: 770 }, { x: 1200, y: 0 })
    expect(kit.coming()).toBeUndefined()
    let bumps = run(theo, 3, () => theo.state === 'resting')
    expect(bumps.filter((bump) => bump.against === 'kit')).toEqual([])
    expect(theo.position().x).toBeGreaterThan(kitAt(kit).x)

    kit.place(...standPoint(floor, 0.5))
    throwFrom(theo, { x: 420, y: 770 }, { x: 1200, y: 0 })
    bumps = run(theo, 3, () => theo.state === 'resting')
    expect(bumps.filter((bump) => bump.against === 'kit')).toHaveLength(1)
    world.free()
  })
})

describe('one clock', () => {
  /** A throw, half a second of frames, with `also` done by Kit before or after Theo in each. */
  function coastWith(
    also?: (kit: KitWorld) => void,
    first = true,
    start?: (kit: KitWorld) => void,
  ) {
    const world = new FigureWorld(rapier)
    const kit = kitOn(world, shelf, 0.5)
    const theo = theoAt(world, { x: 200, y: 200 })
    throwFrom(theo, { x: 200, y: 200 }, { x: 700, y: 120 })
    start?.(kit)
    /** Where Theo was after each step the world had taken. */
    const path = new Map<number, Point>()
    for (let frame = 0; frame < 30; frame++) {
      if (first) also?.(kit)
      theo.advance(STEP)
      if (!first) also?.(kit)
      path.set(world.steps, theo.position())
    }
    const out = {
      at: theo.position(),
      steps: world.steps,
      kit: kit.frame(),
      path,
    }
    world.free()
    return out
  }

  test('Kit walking does not hurry Theo, whoever goes first in the frame', () => {
    const alone = coastWith()
    expect(alone.steps).toBe(30)
    const goal = standPoint(shelf, 0.9)
    const walk = (kit: KitWorld) => {
      kit.walk(goal, 70 * STEP, 'composer')
    }
    for (const first of [true, false]) {
      const both = coastWith(walk, first)
      // Thirty frames, thirty steps: and one as they fall into step, one for Kit to see its surfaces.
      expect(both.steps).toBeGreaterThanOrEqual(30)
      expect(both.steps).toBeLessThanOrEqual(32)
      // Step for step, Theo went the way it goes alone.
      for (const [steps, at] of both.path) {
        const solo = alone.path.get(steps)
        if (!solo) continue
        expect(at.x).toBeCloseTo(solo.x, 3)
        expect(at.y).toBeCloseTo(solo.y, 3)
      }
      // And Kit walked: 70 pixels a second for half a second.
      expect(both.kit[0] - standPoint(shelf, 0.5)[0]).toBeCloseTo(35, 0)
    }
  })

  test('Kit flying does not hurry Theo, nor Theo Kit', () => {
    const alone = coastWith()
    const world = new FigureWorld(rapier)
    const kit = kitOn(world, shelf, 0.5)
    kit.launch({ x: 2, y: -12 }, 0, 'composer')
    for (let frame = 0; frame < 30; frame++) kit.fly()
    const kitAlone = kit.frame()
    world.free()

    for (const first of [true, false]) {
      const both = coastWith(
        (flying) => {
          flying.fly()
        },
        first,
        (flying) => {
          flying.launch({ x: 2, y: -12 }, 0, 'composer')
        },
      )
      expect(both.steps).toBe(30)
      expect(both.at.x).toBeCloseTo(alone.at.x, 3)
      expect(both.at.y).toBeCloseTo(alone.at.y, 3)
      expect(both.kit[0]).toBeCloseTo(kitAlone[0], 3)
      expect(both.kit[1]).toBeCloseTo(kitAlone[1], 3)
    }
  })
})

describe('Kit sees it coming', () => {
  /** What Kit, standing mid-floor, makes of a Theo thrown from `from` at `velocity`. */
  function seen(from: Point, velocity: Point) {
    const world = new FigureWorld(rapier)
    const kit = kitOn(world, floor, 0.5)
    const theo = theoAt(world, from)
    const said: Array<Coming> = []
    kit.onComing = (coming) => said.push(coming)
    throwFrom(theo, from, velocity)
    theo.advance(STEP)
    return { world, kit, theo, said, coming: kit.coming() }
  }

  test('from which side and how soon, and nothing when it is not headed for Kit', () => {
    const left = seen({ x: 420, y: 770 }, { x: 1000, y: 0 })
    expect(left.coming?.from).toBe(-1)
    // About 125 pixels of gap at a little under 1000 a second and slowing.
    expect(left.coming!.in).toBeGreaterThan(0.16)
    expect(left.coming!.in).toBeLessThan(0.26)
    // Said as the world steps, not only when asked.
    expect(left.said.length).toBeGreaterThan(0)
    left.world.free()

    const right = seen({ x: 780, y: 770 }, { x: -1000, y: 0 })
    expect(right.coming?.from).toBe(1)
    right.world.free()

    const away = seen({ x: 420, y: 770 }, { x: -1000, y: 0 })
    expect(away.coming).toBeUndefined()
    expect(away.said).toEqual([])
    away.world.free()

    // Headed for Kit, but thrown too softly to get there.
    const short = seen({ x: 300, y: 770 }, { x: 700, y: 0 })
    expect(short.coming).toBeUndefined()
    run(short.theo, 3, () => short.theo.state === 'resting')
    expect(short.theo.position().x + SIZE.width / 2).toBeLessThan(590)
    expect(short.said).toEqual([])
    short.world.free()

    const above = seen({ x: 420, y: 400 }, { x: 1000, y: 0 })
    expect(above.coming).toBeUndefined()
    above.world.free()
  })

  test('how soon is how long it really takes, the throw slowing as it comes', () => {
    for (const [from, speed] of [
      [420, 1000],
      [340, 1500],
      [500, 600],
    ] as const) {
      const made = seen({ x: from, y: 770 }, { x: speed, y: 0 })
      const said = made.coming?.in
      expect(said).toBeDefined()
      let took: number | undefined
      let steps = 0
      made.kit.onStruck = () => {
        took ??= steps * STEP
      }
      run(made.theo, 2, () => {
        steps++
        return took !== undefined
      })
      expect(took).toBeDefined()
      // To within two steps.
      expect(Math.abs(took! - said!)).toBeLessThan(2 * STEP + 1e-6)
      made.world.free()
    }
  })

  test('a Theo that would clip its head goes over Kit when it ducks', () => {
    // Its bottom edge at 780.5: Kit stands 776 to 798, and ducked 786 to 798.
    const high = seen({ x: 420, y: 760 }, { x: 1200, y: 0 })
    expect(high.coming?.over).toBe(true)
    high.kit.duck(true)
    let struck = false
    high.kit.onStruck = () => {
      struck = true
    }
    const bumps = run(high.theo, 3, () => high.theo.state === 'resting')
    expect(bumps.filter((bump) => bump.against === 'kit')).toEqual([])
    expect(struck).toBe(false)
    expect(high.theo.position().x).toBeGreaterThan(kitAt(high.kit).x)
    // Standing again, the same throw strikes it.
    high.kit.duck(false)
    throwFrom(high.theo, { x: 420, y: 760 }, { x: 1200, y: 0 })
    run(high.theo, 3, () => high.theo.state === 'resting')
    expect(struck).toBe(true)
    high.world.free()
  })

  test('a Theo along the ground cannot be ducked but can be jumped, and Kit above it is not struck', () => {
    const low = seen({ x: 380, y: 771 }, { x: 1300, y: 0 })
    expect(low.coming?.over).toBe(false)
    // Its top edge is at 750.5 and Kit's feet at 798: about a metre and a half, and a little to spare.
    const rise = low.coming?.rise
    expect(rise).toBeGreaterThan((798 - 750.5) / PX)
    expect(rise).toBeLessThan((798 - 750.5) / PX + 0.4)
    let struck = false
    low.kit.onStruck = () => {
      struck = true
    }
    // At the top of a jump that high as Theo arrives.
    const up = Math.sqrt(2 * 30 * (rise! + 0.45))
    let jumped = false
    let landed: string | undefined
    for (let t = 0; t < 4 && landed === undefined; t += STEP) {
      const coming = low.kit.coming()
      if (!jumped && coming && coming.in <= up / 30) {
        low.kit.launch({ x: 0, y: -up }, 0, 'floor')
        jumped = true
      }
      low.theo.advance(STEP)
      if (jumped) {
        const { under } = low.kit.fly()
        if (under !== undefined && Math.abs(low.kit.velocity().y) < 1.2)
          landed = under
      }
    }
    expect(jumped).toBe(true)
    expect(landed).toBe('floor')
    expect(struck).toBe(false)
    expect(low.theo.position().x).toBeGreaterThan(kitAt(low.kit).x)
    low.world.free()
  })

  test('how long it is over Kit for: briefly at speed, and for as long as is said of one that stops there', () => {
    // 82 pixels to cross, still doing better than 500 a second when it gets there.
    const fast = seen({ x: 480, y: 771 }, { x: 1400, y: 0 })
    expect(fast.coming!.passing).toBeGreaterThan(0.05)
    expect(fast.coming!.passing).toBeLessThan(0.25)
    fast.world.free()
    // It gets to Kit with little left, and stops under where Kit stood.
    const spent = seen({ x: 380, y: 771 }, { x: 1000, y: 0 })
    expect(spent.coming!.passing).toBe(1)
    spent.world.free()
  })

  test('ducked, Kit knows while a slowing Theo is still where it would stand up', () => {
    const made = seen({ x: 420, y: 760 }, { x: 1010, y: 0 })
    expect(made.coming?.over).toBe(true)
    made.kit.duck(true)
    let struck = false
    made.kit.onStruck = () => {
      struck = true
    }
    let over = 0
    run(made.theo, 3, () => {
      if (made.kit.overhead()) over++
      return made.theo.state === 'resting'
    })
    // It was over Kit for a while, slower than Kit looks out for at the end of it.
    expect(over).toBeGreaterThan(5)
    expect(struck).toBe(false)
    // At rest it is no longer something to stay down for.
    expect(made.kit.overhead()).toBe(false)
    made.world.free()
  })

  test('one too high to get over has no jump', () => {
    // Dropped on it from above: nothing to jump, nothing to duck.
    const down = seen({ x: 600, y: 620 }, { x: 0, y: 900 })
    expect(down.coming?.rise).toBeUndefined()
    expect(down.coming?.over).toBe(false)
    down.world.free()
  })
})

describe('coming and going', () => {
  test('a figure that leaves takes only its own bodies, and the other carries on', () => {
    const world = new FigureWorld(rapier)
    const kit = kitOn(world, floor, 0.5)
    const theo = theoAt(world, { x: 420, y: 770 })
    kit.destroy()
    expect(world.figure('kit')).toBeUndefined()
    expect(world.figure('theo')).toBeDefined()
    throwFrom(theo, { x: 420, y: 770 }, { x: 1200, y: 0 })
    const bumps = run(theo, 3, () => theo.state === 'resting')
    // Nothing where Kit was.
    expect(bumps.filter((bump) => bump.against === 'kit')).toEqual([])
    expect(theo.position().x).toBeGreaterThan(616)

    const again = kitOn(world, floor, 0.5)
    theo.destroy()
    expect(world.figure('theo')).toBeUndefined()
    again.launch({ x: 3, y: -8 }, 0.1)
    expect(flyFor(again)).toBe('floor')
    world.free()
  })

  test('the page has one world, made by the first figure in and freed by the last out', () => {
    expect(theWorld()).toBeUndefined()
    const one = enterWorld(rapier)
    const two = enterWorld(rapier)
    expect(two).toBe(one)
    expect(theWorld()).toBe(one)
    leaveWorld()
    expect(theWorld()).toBe(one)
    leaveWorld()
    expect(theWorld()).toBeUndefined()
    // Leaving a world no one is in is nothing.
    leaveWorld()
    expect(enterWorld(rapier)).not.toBe(one)
    leaveWorld()
  })
})
