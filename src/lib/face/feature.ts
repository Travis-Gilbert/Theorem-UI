// SOURCING: the superellipse (Lamé curve) for a box that rounds into an ellipse or pinches into a diamond; eight radial gains interpolated around it, the study rig's way of bending one outline into many (theorem-face-study src/rig.js, docs/plans/theo-face.md Sources). The rings, bars and mesh a feature's matter can be gathered into are this app's, for the devices the face turns into (docs/plans/theo-sound.md). The lids that gather cut matter onto their line are this app's, after the reference robot's eyes, which close to a bright line rather than vanishing.
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

/**
 * Where one grain sits in a feature, in face units. `theta` is its angle
 * around the feature (0 the outer side, a quarter turn the bottom) and `u`
 * how far out it is by area (0 the middle, 1 the rim). Writes two numbers to
 * `out` at `at`.
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
