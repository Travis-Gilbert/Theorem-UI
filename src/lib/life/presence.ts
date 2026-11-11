// SOURCING: hand-rolled. The agent's presence is Theorem's own behaviour model (what it attends to, when it works, what it hands back to the field); the damped spring is a few lines of semi-implicit Euler, tuned to overshoot like the anime.js springs in lib/motion, because anime.js tweens DOM values and cannot be stepped inside a textmode frame
import type { Field } from './life'
import type { PatternName } from './patterns'

/**
 * Resting: a small cluster, breathing in place.
 * Attending: the cluster is a pointer travelling to what the agent looks at.
 * Working: the same glyphs gather into an orb where it stands.
 */
export type Activity = 'resting' | 'attending' | 'working'

export interface Point {
  readonly x: number
  readonly y: number
}

/** A glyph shed by the presence; `life` runs from 1 down to 0. */
export interface Spark {
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly life: number
  /** Seconds the spark lasts from full life. */
  readonly span: number
}

/** Positions are in field cells, as floats. */
export interface Presence {
  readonly activity: Activity
  readonly at: Point
  readonly velocity: Point
  readonly target: Point
  readonly sparks: ReadonlyArray<Spark>
  /** Seconds since the activity began. */
  readonly clock: number
  /** Distance travelled since the last trail spark. */
  readonly travelled: number
}

/** A pattern the presence hands to the field, centred on a cell. */
export interface Seed {
  readonly pattern: PatternName
  readonly x: number
  readonly y: number
}

export const REST_SECONDS = 2.5
export const WORK_SECONDS = 1.6

const STIFFNESS = 90
const DAMPING = 2 * Math.sqrt(STIFFNESS) * 0.55
const TRAIL_SPACING = 0.8
const TRAIL_SECONDS = 0.6
const DISPERSE_SECONDS = 0.9
const DISPERSE_SPEED = 9
const DISPERSE_GLYPHS = 10
const SEEDS = ['glider', 'rpentomino', 'acorn', 'lwss'] as const satisfies ReadonlyArray<PatternName>

/** One of a non-empty list; `random` is in [0, 1), so the fallback only covers a misbehaving source. */
const pick = <T,>(items: readonly [T, ...T[]], random: () => number): T =>
  items[Math.floor(random() * items.length)] ?? items[0]

const zero = { x: 0, y: 0 }

export const createPresence = (at: Point): Presence => ({
  activity: 'resting',
  at,
  velocity: zero,
  target: at,
  sparks: [],
  clock: 0,
  travelled: 0,
})

const begin = (presence: Presence, activity: Activity, target: Point): Presence => ({
  ...presence,
  activity,
  target,
  clock: 0,
})

export const attend = (presence: Presence, target: Point) =>
  begin(presence, 'attending', target)

export const work = (presence: Presence) => begin(presence, 'working', presence.at)

/** Work is done: the orb disperses and leaves a pattern in the field. */
export function finish(presence: Presence, random: () => number) {
  const turn = random() * Math.PI * 2
  const burst = Array.from({ length: DISPERSE_GLYPHS }, (_, i) => {
    const angle = turn + (i / DISPERSE_GLYPHS) * Math.PI * 2
    return {
      x: presence.at.x,
      y: presence.at.y,
      vx: Math.cos(angle) * DISPERSE_SPEED,
      vy: Math.sin(angle) * DISPERSE_SPEED * 0.5,
      life: 1,
      span: DISPERSE_SECONDS,
    }
  })
  const seed: Seed = {
    pattern: pick(SEEDS, random),
    x: Math.round(presence.at.x),
    y: Math.round(presence.at.y),
  }
  return {
    presence: { ...begin(presence, 'resting', presence.at), sparks: burst },
    seed,
  }
}

export interface AdvanceOptions {
  /** Reduced motion: keep location and state, drop continuous movement. */
  readonly still?: boolean
  /** The person is drawing: keep moving, stop shedding a trail. */
  readonly quiet?: boolean
}

const fade = (sparks: ReadonlyArray<Spark>, dt: number) =>
  sparks
    .map((spark) => {
      const drag = Math.exp(-6 * dt)
      return {
        x: spark.x + spark.vx * dt,
        y: spark.y + spark.vy * dt,
        vx: spark.vx * drag,
        vy: spark.vy * drag,
        life: spark.life - dt / spark.span,
        span: spark.span,
      }
    })
    .filter((spark) => spark.life > 0)

export function advance(
  presence: Presence,
  seconds: number,
  { still = false, quiet = false }: AdvanceOptions = {},
): Presence {
  const clock = presence.clock + seconds
  if (still)
    return { ...presence, at: presence.target, velocity: zero, sparks: [], clock }
  const dt = Math.min(seconds, 1 / 30)
  const { at, target, velocity } = presence
  const vx = velocity.x + (STIFFNESS * (target.x - at.x) - DAMPING * velocity.x) * dt
  const vy = velocity.y + (STIFFNESS * (target.y - at.y) - DAMPING * velocity.y) * dt
  const next = { x: at.x + vx * dt, y: at.y + vy * dt }
  const travelled = presence.travelled + Math.hypot(vx * dt, vy * dt)
  const shed = !quiet && travelled >= TRAIL_SPACING
  const sparks = fade(presence.sparks, dt)
  return {
    ...presence,
    at: next,
    velocity: { x: vx, y: vy },
    sparks: shed ? [...sparks, { ...at, vx: 0, vy: 0, life: 1, span: TRAIL_SECONDS }] : sparks,
    clock,
    travelled: shed || quiet ? 0 : travelled,
  }
}

/** One glyph of the presence, offset in cells from where it stands. */
export interface Glyph {
  readonly dx: number
  readonly dy: number
  readonly glyph: string
  /** 0 to 1: how much light the glyph catches. */
  readonly weight: number
}

const DIAGONALS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const

const ring = (count: number, radius: number, turn: number, aspect: number) =>
  Array.from({ length: count }, (_, i) => {
    const angle = turn + (i / count) * Math.PI * 2
    return { dx: Math.cos(angle) * radius * aspect, dy: Math.sin(angle) * radius }
  })

/**
 * The glyphs the presence is drawn with. `aspect` is a cell's height over its
 * width, so an orb reads round on a grid of tall cells.
 */
export function figure(presence: Presence, time: number, aspect: number): Glyph[] {
  const { activity, velocity, clock } = presence
  if (activity === 'working') {
    const gather = 1 - (1 - Math.min(clock / 0.45, 1)) ** 3
    const orbit = ring(10, 1 + 2 * gather, time * 1.6, aspect).map((offset, i) => ({
      ...offset,
      glyph: '*+x'.charAt(i % 3),
      weight: 0.55 + 0.45 * Math.sin(time * 5 + i),
    }))
    return [{ dx: 0, dy: 0, glyph: 'o', weight: 1 }, ...orbit]
  }
  const speed = Math.hypot(velocity.x, velocity.y)
  if (activity === 'attending' && speed > 1) {
    const back = { x: -velocity.x / speed, y: -velocity.y / speed }
    return [
      { dx: 0, dy: 0, glyph: '@', weight: 1 },
      { dx: back.x, dy: back.y, glyph: '+', weight: 0.7 },
      { dx: back.x * 2, dy: back.y * 2, glyph: '.', weight: 0.4 },
    ]
  }
  const breath = 0.5 + 0.5 * Math.sin(time * 2)
  // The four diagonal cells, whatever the cell shape: a ring this small rounds
  // onto a single column.
  const satellites = DIAGONALS.map(([dx, dy]) => ({
    dx,
    dy,
    glyph: ':',
    weight: 0.35 + 0.35 * breath,
  }))
  return [{ dx: 0, dy: 0, glyph: '*', weight: activity === 'attending' ? 1 : 0.8 }, ...satellites]
}

function livingCell(field: Field, random: () => number): Point {
  const living: number[] = []
  field.age.forEach((age, i) => age > 0 && living.push(i))
  const i = living[Math.floor(random() * living.length)]
  if (i === undefined)
    return {
      x: Math.floor(random() * field.cols),
      y: Math.floor(random() * field.rows),
    }
  return { x: i % field.cols, y: Math.floor(i / field.cols) }
}

export interface CompanionOptions {
  readonly random: () => number
  /** The person is drawing; the companion holds back rather than start something. */
  readonly personActive?: boolean
  /** Seconds to rest before looking again; REST_SECONDS unless the field says otherwise. */
  readonly rest?: number
}

/**
 * The agent playing along: rest, go and look at something alive, work there,
 * then hand a pattern back to the field.
 */
export function companion(
  presence: Presence,
  field: Field,
  { random, personActive = false, rest = REST_SECONDS }: CompanionOptions,
): { presence: Presence; seed?: Seed } {
  const { activity, clock, at, target, velocity } = presence
  if (activity === 'resting' && clock >= rest && !personActive)
    return { presence: attend(presence, livingCell(field, random)) }
  const arrived =
    Math.hypot(target.x - at.x, target.y - at.y) < 0.5 &&
    Math.hypot(velocity.x, velocity.y) < 2
  if (activity === 'attending' && arrived) return { presence: work(presence) }
  if (activity === 'working' && clock >= WORK_SECONDS) return finish(presence, random)
  return { presence }
}
