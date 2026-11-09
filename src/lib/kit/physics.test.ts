import { beforeAll, describe, expect, test } from 'bun:test'
import {
  GRAVITY,
  KitWorld,
  PX,
  STEP,
  bodyOf,
  frameOf,
  launchVelocity,
  loadRapier,
  timeToFall,
} from './physics'
import { standPoint } from './stage'
import type { PerchLine } from './stage'

const floor: PerchLine = { name: 'floor', left: 0, right: 1200, y: 798 }
const composer: PerchLine = { name: 'composer', left: 600, right: 1000, y: 500 }
const message: PerchLine = { name: 'message:m1', left: 100, right: 900, y: 300 }
const lines = [composer, message, floor]

let rapier: Awaited<ReturnType<typeof loadRapier>>
beforeAll(async () => {
  rapier = await loadRapier()
})

/** A world over these lines with Kit standing at `at` along `on`. */
function worldOn(on: PerchLine, at: number) {
  const world = new KitWorld(rapier, ...standPoint(on, at))
  world.sync(lines, 1200, 800)
  return world
}

/** Flies until Kit rests on a surface or `seconds` pass; where it rests. */
function flyFor(world: KitWorld, seconds = 6) {
  for (let t = 0; t < seconds; t += STEP) {
    const { under } = world.fly()
    if (under !== undefined && Math.abs(world.velocity().y) < 1.2) return under
  }
  return undefined
}

describe('the frame and the body', () => {
  test('convert both ways', () => {
    const [x, y] = frameOf(bodyOf(120, 340))
    expect(x).toBeCloseTo(120)
    expect(y).toBeCloseTo(340)
  })
})

describe('a jump solved for its landing', () => {
  test('passes the asked height and comes down on the point', () => {
    const from = { x: 2, y: 20 }
    const to = { x: 14, y: 12 }
    const v = launchVelocity(from, to, 1.5)
    const apex = from.y - (v.y * v.y) / (2 * GRAVITY)
    expect(apex).toBeCloseTo(to.y - 1.5)
    const x = from.x + v.x * v.time
    const y = from.y + v.y * v.time + (GRAVITY * v.time * v.time) / 2
    expect(x).toBeCloseTo(to.x)
    expect(y).toBeCloseTo(to.y)
  })

  test('the time left to fall matches the flight', () => {
    const v = launchVelocity({ x: 0, y: 10 }, { x: 4, y: 10 }, 2)
    expect(timeToFall(10, v.y, 10)).toBeCloseTo(v.time)
    expect(timeToFall(10, -1, 1)).toBeUndefined()
  })
})

describe("Kit's world", () => {
  test('a jump aimed at the composer lands on it near the point', () => {
    const world = worldOn(floor, 0.1)
    const [gx, gy] = standPoint(composer, 0.5)
    const [x, y] = world.frame()
    world.launch(
      launchVelocity(bodyOf(x, y), bodyOf(gx, gy), 1.5),
      0,
      'composer',
    )
    expect(flyFor(world)).toBe('composer')
    const [lx, ly] = world.frame()
    expect(Math.abs(lx - gx)).toBeLessThan(12)
    expect(Math.abs(ly - gy)).toBeLessThan(2)
    world.destroy()
  })

  test('Kit rises up through a message and is caught on top coming down', () => {
    const world = worldOn(floor, 0.3)
    const [gx, gy] = standPoint(message, 0.3)
    const [x, y] = world.frame()
    world.launch(launchVelocity(bodyOf(x, y), bodyOf(gx, gy), 1), 0)
    expect(flyFor(world)).toBe('message:m1')
    expect(world.frame()[1]).toBeCloseTo(gy, 0)
    world.destroy()
  })

  test('an aimed jump passes over surfaces that are not its target', () => {
    const world = worldOn(floor, 0.55)
    const [gx, gy] = standPoint(floor, 0.95)
    const [x, y] = world.frame()
    // Its arc comes down through the composer, which does not catch it.
    world.launch(launchVelocity(bodyOf(x, y), bodyOf(gx, gy), 10), 0, 'floor')
    expect(flyFor(world)).toBe('floor')
    world.destroy()
  })

  test('a throw bounces off the window and comes to rest on something', () => {
    const world = worldOn(composer, 0.5)
    world.launch({ x: 35, y: -12 }, 0.4)
    const rest = flyFor(world, 10)
    expect(rest).toBeDefined()
    const [x] = world.frame()
    expect(x).toBeGreaterThan(-8)
    expect(x).toBeLessThan(1200)
    world.destroy()
  })

  test('walking along a surface reaches the point, the controller on the ground', () => {
    const world = worldOn(composer, 0)
    const goal = standPoint(composer, 1)
    let grounded = true
    for (let t = 0; t < 8 && grounded; t += STEP) {
      grounded = world.walk(goal, 190 * STEP, 'composer')
      if (Math.abs(world.frame()[0] - goal[0]) < 1) break
    }
    expect(grounded).toBe(true)
    expect(world.frame()[0]).toBeCloseTo(goal[0], 0)
    expect(Math.abs(world.frame()[1] - goal[1])).toBeLessThan(1)
    world.destroy()
  })

  test('a surface that went away leaves Kit with no ground under it', () => {
    const world = worldOn(composer, 0.5)
    world.sync([message, floor], 1200, 800)
    expect(world.walk(standPoint(composer, 0.6), 70 * STEP, 'composer')).toBe(
      false,
    )
    world.destroy()
  })

  test('a moved surface carries its slab', () => {
    const world = worldOn(floor, 0.5)
    world.sync([{ ...composer, y: 450 }, message, floor], 1200, 800)
    world.fly()
    expect(world.line('composer')?.y).toBe(450)
    expect(PX).toBe(32)
    world.destroy()
  })
})
