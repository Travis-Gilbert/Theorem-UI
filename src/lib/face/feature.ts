// SOURCING: the superellipse (Lamé curve) for a box that rounds into an ellipse or pinches into a diamond; eight radial gains interpolated around it, the study rig's way of bending one outline into many (theorem-face-study src/rig.js, docs/plans/theo-face.md Sources). The lids that gather cut matter onto their line are this app's, after the reference robot's eyes, which close to a bright line rather than vanishing.
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
  const radius = Math.sqrt(hollow * hollow + (1 - hollow * hollow) * u)
  let x = radius * rim * gain * shape.w * cos
  let y = radius * rim * gain * shape.h * sin

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
