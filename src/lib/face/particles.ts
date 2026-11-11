// SOURCING: the study's particle face (theorem-face-study src/rig.js: a fixed budget of grains, each with a seat in a feature, sprung toward it) and Martin Roberts' R2 low-discrepancy sequence for seats that fill a shape evenly at any count; the spring is the semi-implicit Euler of lib/life/life.ts. Matter shared between features by rank, the lag behind a moving head and the poke are this app's.
import { clamp } from './channels'
import { restShape, seatPoint } from './feature'
import type { Shape } from './feature'
import type { Identity } from './identity'

/** What the matter is like this frame. */
export interface Matter {
  cohesion: number
  jitter: number
  drift: number
  size: number
  glow: number
  hue: number
}

/** Numbers per grain in the buffer both renderers draw: x, y, radius, spare, then premultiplied r, g, b, a. */
export const GRAIN_STRIDE = 8

const TAU = Math.PI * 2
const R2_A = 0.7548776662466927
const R2_B = 0.5698402909980532
const frac = (value: number) => value - Math.floor(value)
/** A cheap repeatable noise in [-1, 1] from two integers. */
const noise = (a: number, b: number) =>
  frac(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) * 2 - 1

/**
 * The face's matter: a fixed number of grains, each sprung toward its seat
 * in whichever feature owns it. Features share the grains by `share`, so a
 * feature that grows draws grains out of the others and they fly across.
 */
export class Field {
  readonly count: number
  private readonly x: Float32Array
  private readonly y: Float32Array
  private readonly vx: Float32Array
  private readonly vy: Float32Array
  private readonly light: Float32Array
  private readonly theta: Float32Array
  private readonly u: Float32Array
  private readonly phase: Float32Array
  private readonly seat = new Float32Array(2)
  private readonly bounds: Array<number> = []
  private readonly limitX: number
  private readonly limitY: number
  private started = false

  constructor(identity: Identity, seed: number) {
    const count = identity.grains
    this.count = count
    this.x = new Float32Array(count)
    this.y = new Float32Array(count)
    this.vx = new Float32Array(count)
    this.vy = new Float32Array(count)
    this.light = new Float32Array(count)
    this.theta = new Float32Array(count)
    this.u = new Float32Array(count)
    this.phase = new Float32Array(count)
    this.limitX = identity.width / 2 - 1
    this.limitY = identity.height / 2 - 1
    const a = frac(seed * 0.000123 + 0.37)
    const b = frac(seed * 0.000457 + 0.11)
    // Seats are laid in a square and bent onto the feature shell by shell, so a
    // boxy feature fills evenly into its corners. One grain in four sits on the
    // rim, so a feature has a clean edge; the rest fill it.
    let fill = 0
    let rim = 0
    for (let index = 0; index < count; index++) {
      let sx: number
      let sy: number
      if (index % 4 === 0) {
        const along = frac(a + ++rim * 0.6180339887) * 4
        const side = Math.floor(along)
        const t = (along - side) * 2 - 1
        sx = side === 0 ? 1 : side === 1 ? -t : side === 2 ? -1 : t
        sy = side === 0 ? t : side === 1 ? 1 : side === 2 ? -t : -1
      } else {
        fill++
        sx = frac(a + fill * R2_A) * 2 - 1
        sy = frac(b + fill * R2_B) * 2 - 1
      }
      const shell = Math.max(Math.abs(sx), Math.abs(sy))
      this.theta[index] = (Math.atan2(sy, sx) + TAU) % TAU
      this.u[index] = shell * shell
      this.phase[index] = frac(seed * 0.0001 + (index + 1) * 0.6180339887)
    }
  }

  /** Which shape owns each grain: ranks split by cumulative share. */
  private split(shapes: ReadonlyArray<Shape>) {
    let total = 0
    for (const shape of shapes) total += Math.max(0, shape.share)
    this.bounds.length = shapes.length
    let sum = 0
    for (let index = 0; index < shapes.length; index++) {
      sum += Math.max(0, (shapes[index] as Shape).share)
      this.bounds[index] = total > 0 ? (sum / total) * this.count : 0
    }
    return total > 0
  }

  /**
   * Moves the grains on by `dt` seconds toward their seats. `time` is the
   * face's own clock in seconds, which the tremble and wander are read from.
   */
  step(shapes: ReadonlyArray<Shape>, matter: Matter, dt: number, time: number) {
    const any = this.split(shapes)
    // What a globe has turned and been stirred is kept here, so a change of speed carries on from where it was.
    for (const shape of shapes) {
      shape.spun += shape.spin * dt
      shape.stirred += shape.stir * dt
    }
    const cohesion = clamp(matter.cohesion, 0, 1)
    const baseOmega = 6 + 26 * cohesion
    const zeta = 0.5 + 0.45 * cohesion
    const tremble = matter.jitter * 1.8
    const wander = matter.drift * 1.3
    const tick = Math.floor(time * 24)
    const fade = 1 - Math.exp(-dt * 9)
    let owner = 0
    for (let index = 0; index < this.count; index++) {
      while (
        owner < shapes.length - 1 &&
        index >= (this.bounds[owner] as number)
      )
        owner++
      const shape = any ? shapes[owner] : undefined
      const phase = this.phase[index] as number
      let tx = 0
      let ty = 0
      let light = 0
      if (shape) {
        light =
          shape.alpha *
          seatPoint(
            shape,
            this.theta[index] as number,
            this.u[index] as number,
            this.seat,
            0,
          )
        tx = this.seat[0] as number
        ty = this.seat[1] as number
      }
      if (tremble > 0) {
        tx += noise(index, tick) * tremble
        ty += noise(index + 7919, tick) * tremble
      }
      if (wander > 0) {
        tx += Math.sin(time * 0.9 + phase * TAU * 7) * wander
        ty += Math.cos(time * 0.7 + phase * TAU * 13) * wander
      }
      tx = clamp(tx, -this.limitX, this.limitX)
      ty = clamp(ty, -this.limitY, this.limitY)
      if (!this.started) {
        this.x[index] = tx
        this.y[index] = ty
        this.light[index] = light
        continue
      }
      const omega = baseOmega * (0.72 + 0.56 * phase)
      const px = this.x[index] as number
      const py = this.y[index] as number
      let vx = this.vx[index] as number
      let vy = this.vy[index] as number
      vx += (-omega * omega * (px - tx) - 2 * zeta * omega * vx) * dt
      vy += (-omega * omega * (py - ty) - 2 * zeta * omega * vy) * dt
      this.vx[index] = vx
      this.vy[index] = vy
      this.x[index] = px + vx * dt
      this.y[index] = py + vy * dt
      this.light[index] =
        (this.light[index] as number) +
        (light - (this.light[index] as number)) * fade
    }
    this.started = true
  }

  /** The head moved under the matter by this much, in face units: the matter lags behind. */
  shove(dx: number, dy: number) {
    if (dx === 0 && dy === 0) return
    for (let index = 0; index < this.count; index++) {
      const give = 0.5 + 0.5 * (this.phase[index] as number)
      this.x[index] = clamp(
        (this.x[index] as number) - dx * give,
        -this.limitX,
        this.limitX,
      )
      this.y[index] = clamp(
        (this.y[index] as number) - dy * give,
        -this.limitY,
        this.limitY,
      )
    }
  }

  /** Pushes the matter away from a point: a poke. `strength` is face units per second at the point. */
  burst(x: number, y: number, strength: number, reach = 14) {
    for (let index = 0; index < this.count; index++) {
      const dx = (this.x[index] as number) - x
      const dy = (this.y[index] as number) - y
      const d2 = dx * dx + dy * dy
      const fall = strength / (1 + d2 / (reach * reach))
      const d = Math.sqrt(d2) || 1
      const spin = (this.phase[index] as number) - 0.5
      this.vx[index] =
        (this.vx[index] as number) + ((dx / d) * fall - (dy / d) * fall * spin)
      this.vy[index] =
        (this.vy[index] as number) + ((dy / d) * fall + (dx / d) * fall * spin)
    }
  }

  /** Writes every grain for drawing. `colour` is straight sRGB in 0..1. */
  write(
    out: Float32Array,
    matter: Matter,
    grain: number,
    colour: readonly [number, number, number],
  ) {
    const glow = clamp(matter.glow, 0, 1.5)
    for (let index = 0; index < this.count; index++) {
      const at = index * GRAIN_STRIDE
      const phase = this.phase[index] as number
      const alpha = clamp(
        (this.light[index] as number) * glow * (0.62 + 0.3 * phase),
        0,
        1,
      )
      out[at] = this.x[index] as number
      out[at + 1] = this.y[index] as number
      out[at + 2] = grain * matter.size * (0.78 + 0.5 * phase)
      out[at + 3] = phase
      out[at + 4] = colour[0] * alpha
      out[at + 5] = colour[1] * alpha
      out[at + 6] = colour[2] * alpha
      out[at + 7] = alpha
    }
    return out
  }

  /** The matter's bounding box and centre of light, for tests and the manual. */
  extent() {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (let index = 0; index < this.count; index++) {
      const px = this.x[index] as number
      const py = this.y[index] as number
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
    }
    return { minX, maxX, minY, maxY }
  }
}

/** A list of shapes kept the same length as the face's features, reused across frames. */
export function shapesFor(shapes: Array<Shape>, count: number) {
  while (shapes.length < count) shapes.push(restShape())
  shapes.length = count
  return shapes
}

/** OKLCH to straight sRGB in 0..1 (Björn Ottosson's OKLab matrices). */
export function oklch(
  lightness: number,
  chroma: number,
  hue: number,
): [number, number, number] {
  const angle = (hue * Math.PI) / 180
  const a = chroma * Math.cos(angle)
  const b = chroma * Math.sin(angle)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const gamma = (value: number) =>
    clamp(
      value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055,
      0,
      1,
    )
  return [
    gamma(linear[0] as number),
    gamma(linear[1] as number),
    gamma(linear[2] as number),
  ]
}
