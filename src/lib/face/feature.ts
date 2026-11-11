// SOURCING: the superellipse (Lamé curve) for a box that rounds into an ellipse or pinches into a diamond; eight radial gains interpolated around it, the study rig's way of bending one outline into many (theorem-face-study src/rig.js, docs/plans/theo-face.md Sources). The rings, bars and mesh a feature's matter can be gathered into are this app's, for the devices the face turns into (docs/plans/theo-sound.md). The globe is an orthographic sphere of dots in rows of latitude, each row turned about the pole and the whole leaned toward the viewer, with grains on tilted circular orbits: the dotted thought-orb of agent interfaces (thinking-orbs by Jakub Antalik, MIT, which the app's inline indicator uses; none of its code is here), remade from this face's own matter so that what it has turned is integrated from a speed that events change, where that one is a function of the clock (docs/plans/theo-orb.md). The lids that gather cut matter onto their line are this app's, after the reference robot's eyes, which close to a bright line rather than vanishing.
import { FEATURE_PARAMS, FEATURE_PARAM_NAMES } from './channels'
import type { FeatureDef, FeatureParam } from './channels'

/** A feature's numbers at one instant, read off the rig. */
export interface Shape {
  /** -1 left of the centre line, 1 right, 0 on it. */
  side: -1 | 0 | 1
  x: number
  y: number
  w: number
  h: number
  round: number
  readonly gains: Float32Array
  lid: number
  lidTilt: number
  lidBow: number
  low: number
  lowTilt: number
  lowBow: number
  hollow: number
  rings: number
  slats: number
  mesh: number
  globe: number
  spin: number
  stir: number
  /** How far a globe has turned, in turns, and how much it has been stirred: kept by the matter (particles), not read off the rig. */
  spun: number
  stirred: number
  turn: number
  scale: number
  alpha: number
  share: number
}

export const sideOf = (def: FeatureDef): -1 | 0 | 1 =>
  def.side === 'left' ? -1 : def.side === 'right' ? 1 : 0

/** A shape at rest, to be filled in. */
export function restShape(side: -1 | 0 | 1 = 0): Shape {
  const rest = (param: FeatureParam) => FEATURE_PARAMS[param].rest
  return {
    side,
    x: rest('x'),
    y: rest('y'),
    w: rest('w'),
    h: rest('h'),
    round: rest('round'),
    gains: new Float32Array(8).fill(1),
    lid: 0,
    lidTilt: 0,
    lidBow: 0,
    low: 0,
    lowTilt: 0,
    lowBow: 0,
    hollow: 0,
    rings: 0,
    slats: 0,
    mesh: 0,
    globe: 0,
    spin: 0,
    stir: 0,
    spun: 0,
    stirred: 0,
    turn: 0,
    scale: 1,
    alpha: 1,
    share: 1,
  }
}

/** Fills a shape from whatever reads a feature's channels. */
export function readShape(
  shape: Shape,
  id: string,
  read: (channel: string) => number,
) {
  for (const param of FEATURE_PARAM_NAMES) {
    const value = read(`${id}.${param}`)
    if (param.length === 2 && param.startsWith('r'))
      shape.gains[Number(param[1])] = value
    else (shape as unknown as Record<string, number>)[param] = value
  }
  return shape
}

const TAU = Math.PI * 2
/** How far down the eye the lids meet when the upper one shuts, as a fraction of the half height. */
const MEET = 0.3
/** What is left of a cut grain's distance past the lid: a shut eye is a line with a little body. */
const RESIDUE = 0.07
/** How much of the gap between two rings, or two bars, the matter of one fills. */
const BAND = 0.34
/** How much of the step between two dots of a mesh the matter of one fills. */
const DOT = 0.46
/** How far apart the rows of a mesh are, in steps: every other row sits between the dots of the last. */
const ROW = Math.sqrt(3) / 2
/** How much of a meshed feature's matter is its rim, how wide the rim is and how far the dots keep from it, as parts of the feature. */
const RIM_SHARE = 0.24
const RIM_WIDTH = 0.07
const RIM_GAP = 0.03
/** How many dots a globe has round its middle for each row it has from pole to pole. */
const AROUND = 1.9
/** How much of the step between two dots of a globe the matter of one fills. */
const BEAD = 0.4
/** How far the globe's axis leans toward whoever looks, in radians, and how far a stirred one wanders from that. */
const LEAN = 0.5
const WANDER = 0.38
/** Of the matter a flat feature keeps on its rim, the part a globe sends into orbit; how many orbits; how far out they are, in radii; how long a tail each trails, in radians. */
const ORBIT_SHARE = 0.5
const ORBITS = 3
const ORBIT_REACH = 1.5
const TAIL = 1.3
/** How dim the far side of a globe is. */
const FAR = 0.1
const fraction = (value: number) => value - Math.floor(value)
/** A repeatable number in [-1, 1] for a whole number: each row of a globe has its own. */
const own = (index: number) =>
  fraction(Math.sin(index * 12.9898 + 4.1414) * 43758.5453) * 2 - 1

/**
 * Where one grain sits in a feature, in face units. `theta` is its angle
 * around the feature (0 the outer side, a quarter turn the bottom) and `u`
 * how far out it is by area (0 the middle, 1 the rim). Writes two numbers to
 * `out` at `at`, and gives back how much of its light the grain keeps there:
 * 1, but for the far side of a globe.
 */
export function seatPoint(
  shape: Shape,
  theta: number,
  u: number,
  out: Float32Array | Array<number>,
  at: number,
) {
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const n = shape.round
  const rim = Math.pow(
    Math.pow(Math.abs(cos), n) + Math.pow(Math.abs(sin), n),
    -1 / n,
  )
  const turnAt = ((theta / TAU) % 1) * 8
  const index = Math.floor(turnAt) & 7
  const part = turnAt - Math.floor(turnAt)
  const smooth = part * part * (3 - 2 * part)
  const from = shape.gains[index] as number
  const gain = from + ((shape.gains[(index + 1) & 7] as number) - from) * smooth
  const hollow = shape.hollow
  let radius = Math.sqrt(hollow * hollow + (1 - hollow * hollow) * u)
  // Rings: each grain goes to the ring its depth falls in, the outermost on the rim.
  const rings = Math.round(shape.rings)
  if (rings >= 1) {
    const depth = Math.min(rings - 1e-6, u * rings)
    const ring = Math.floor(depth)
    const outer = hollow + ((1 - hollow) * (ring + 1)) / rings
    radius = outer - ((1 - hollow) / rings) * BAND * (1 - (depth - ring))
  }
  let x = radius * rim * gain * shape.w * cos
  let y = radius * rim * gain * shape.h * sin
  // Bars: each grain goes to the bar its height falls in.
  const slats = Math.round(shape.slats)
  if (slats >= 1 && shape.h > 0) {
    const height = Math.max(-1, Math.min(1, y / shape.h))
    const bar = Math.min(slats - 1, Math.floor(((height + 1) / 2) * slats))
    const middle = -1 + (2 * bar + 1) / slats
    y = (middle + (height - middle) * BAND) * shape.h
  }
  // Mesh: the outermost matter is the rim, and each grain inside goes to the dot its place falls in, every
  // other row half a step along. Where the nearest dot would cross the rim the grain looks further in.
  const mesh = Math.round(shape.mesh)
  if (mesh >= 1 && shape.w > 0 && shape.h > 0) {
    if (u > 1 - RIM_SHARE) {
      const band = 1 - RIM_WIDTH * ((1 - u) / RIM_SHARE)
      x = band * rim * gain * shape.w * cos
      y = band * rim * gain * shape.h * sin
    } else {
      const step = (2 * shape.w) / mesh
      const reach = 1 - RIM_WIDTH - RIM_GAP - (DOT * step) / (2 * shape.w)
      let inward = Math.sqrt(u / (1 - RIM_SHARE))
      for (let tries = 0; tries < 4; tries++) {
        const px = inward * rim * gain * shape.w * cos
        const py = inward * rim * gain * shape.h * sin
        const row = Math.round(py / (step * ROW))
        const shift = ((row & 1) === 1 ? mesh % 2 : 1 - (mesh % 2)) / 2
        const dotX = (Math.round(px / step - shift) + shift) * step
        const dotY = row * step * ROW
        x = dotX + (px - dotX) * DOT
        y = dotY + (py - dotY) * DOT
        const past = Math.pow(
          Math.pow(Math.abs(dotX / shape.w), n) +
            Math.pow(Math.abs(dotY / shape.h), n),
          1 / n,
        )
        if (past <= reach) break
        inward *= 0.82
      }
    }
  }

  // Globe: the matter is dots on a ball that turns, seen from the side, and a few grains orbit it.
  let light = 1
  const rows = Math.round(shape.globe)
  if (rows >= 1) {
    const turned = shape.spun * TAU
    const stirred = shape.stirred * TAU
    let px: number
    let py: number
    let pz: number
    // The rim of a flat feature is a quarter of its matter, all at one depth: part of it orbits, the rest is spread over the ball.
    const edge = u > 0.9995
    const lot = fraction(theta * 7.3137)
    const pick = fraction(theta * 23.1731)
    if (edge && lot < ORBIT_SHARE) {
      const orbit = Math.min(ORBITS - 1, Math.floor(pick * ORBITS))
      const back = fraction(pick * ORBITS)
      const head =
        orbit * 2.1 + (turned * 1.6 + stirred * 2.4) * (0.7 + 0.3 * orbit)
      const angle = head - back * back * TAIL
      // How open the orbit is to whoever looks: never edge on, where its grains would pile up at the two ends, and each one different.
      const tip = 0.35 + 0.2 * orbit + 0.12 * Math.sin(stirred * 0.31 + orbit)
      const roll = (orbit * TAU) / ORBITS + 0.4
      const ox = Math.cos(angle) * ORBIT_REACH
      const oy = Math.sin(angle) * ORBIT_REACH * Math.sin(tip)
      const oz = Math.sin(angle) * ORBIT_REACH * Math.cos(tip)
      px = ox * Math.cos(roll) - oy * Math.sin(roll)
      py = ox * Math.sin(roll) + oy * Math.cos(roll)
      pz = oz
      light = 1 - 0.75 * back
    } else {
      const deep = edge ? pick : u / 0.9995
      const lat = Math.asin(Math.max(-1, Math.min(1, 1 - 2 * deep)))
      const row = Math.min(
        rows - 1,
        Math.max(0, Math.floor((lat / Math.PI + 0.5) * rows)),
      )
      const rowLat = ((row + 0.5) / rows - 0.5) * Math.PI
      const dots = Math.max(1, Math.round(rows * AROUND * Math.cos(rowLat)))
      const along = (theta / TAU) * dots
      const dot = Math.floor(along)
      // Each row turns with the ball, and slides past its neighbours by as much as the ball has been stirred.
      const lon =
        ((dot + 0.5 + (along - dot - 0.5) * BEAD) / dots) * TAU +
        (row & 1) * (Math.PI / dots) +
        turned +
        own(row) * stirred * 0.6
      const up =
        rowLat +
        (lat - rowLat) * BEAD +
        shape.stir * 0.1 * Math.sin(2 * lon + stirred * 1.3 + row)
      // The ball's axis leans toward whoever looks, and wanders the more it is stirred.
      const lean = LEAN + WANDER * shape.stir * Math.sin(stirred * 0.23 + 1.3)
      const flat = Math.cos(up) * Math.cos(lon)
      px = Math.cos(up) * Math.sin(lon)
      py = Math.sin(up) * Math.cos(lean) - flat * Math.sin(lean)
      pz = Math.sin(up) * Math.sin(lean) + flat * Math.cos(lean)
    }
    // Ball and orbits sway together, the more it is stirred.
    const sway = WANDER * shape.stir * Math.sin(stirred * 0.17)
    const swayed = px * Math.cos(sway) - py * Math.sin(sway)
    py = px * Math.sin(sway) + py * Math.cos(sway)
    px = swayed
    x = px * shape.w
    y = py * shape.h
    const near = Math.max(0, Math.min(1, (pz + 0.35) / 0.9))
    light *= FAR + (1 - FAR) * near * near * (3 - 2 * near)
  }

  // Lids. `across` runs -1 at the inner end to 1 at the outer.
  const h = shape.h
  const across = shape.w > 0 ? Math.max(-1.4, Math.min(1.4, x / shape.w)) : 0
  const dome = 1 - across * across
  const dragged = shape.lid > 0.6 ? (shape.lid - 0.6) / 0.4 : 0
  const low = shape.low + dragged * (1 - shape.low) * ((1 - MEET) / 2)
  let top =
    -h +
    shape.lid * (1 + MEET) * h -
    shape.lidTilt * h * across +
    shape.lidBow * h * 0.9 * dome
  let bottom =
    h -
    low * 2 * h -
    shape.lowTilt * h * -across -
    shape.lowBow * h * 0.9 * dome
  if (top > bottom) top = bottom = (top + bottom) / 2
  if (y < top) y = top + (y - top) * RESIDUE
  else if (y > bottom) y = bottom + (y - bottom) * RESIDUE

  x *= shape.scale
  y *= shape.scale
  if (shape.turn !== 0) {
    const angle = (shape.turn * Math.PI) / 180
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const turned = x * c - y * s
    y = x * s + y * c
    x = turned
  }
  out[at] = shape.side === 0 ? shape.x + x : shape.side * (shape.x + x)
  out[at + 1] = shape.y + y
  return light
}

/** The feature's outline as an SVG path in face units, for the still mark. */
export function outlinePath(shape: Shape, steps = 48) {
  const point = [0, 0]
  let path = ''
  for (let step = 0; step < steps; step++) {
    seatPoint(shape, (step / steps) * TAU, 1, point, 0)
    path += `${step === 0 ? 'M' : 'L'}${(point[0] as number).toFixed(2)} ${(point[1] as number).toFixed(2)}`
  }
  return `${path}Z`
}
