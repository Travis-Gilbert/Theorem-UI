// SOURCING: the signed distance to a rounded box (Inigo Quilez, "2D distance functions"), which is a ball when its half sizes and its corner are one length; exponential easing toward a target, as components/face/driver eases the figure's size. That the plate draws in to a ball behind the orb, so the orb is the face's two materials (its light and its dark) and reads on a light page, is the owner's (docs/plans/theo-orb.md, "On the plate").
import type { Ball } from '@/lib/face/engine'

/** The plate's outline in face units, centre 0,0, y down: a box with rounded corners. With both half sizes equal to the corner it is a ball. */
export interface Plate {
  x: number
  y: number
  hw: number
  hh: number
  corner: number
}

/** The plate's corner, as a part of its width. */
export const CORNER = 0.18
/** How far the ball's edge stands off the dots on it, in face units. */
export const RIM = 3.2
/** How quickly the plate draws in and out, per second. */
const RATE = 10

/** The plate, `amount` of the way from whole (0) to drawn in round a ball (1). */
export function plateOf(
  width: number,
  height: number,
  ball: Ball | undefined,
  amount: number,
): Plate {
  const whole = {
    x: 0,
    y: 0,
    hw: width / 2,
    hh: height / 2,
    corner: width * CORNER,
  }
  if (!ball || amount <= 0) return whole
  const t = Math.min(1, amount)
  const r = Math.min(ball.r + RIM, height / 2)
  const mix = (from: number, to: number) => from * (1 - t) + to * t
  return {
    x: mix(0, ball.x),
    y: mix(0, ball.y),
    hw: mix(whole.hw, r),
    hh: mix(whole.hh, r),
    corner: mix(whole.corner, r),
  }
}

/** How far a point is outside the plate, in face units: negative inside it. */
export function offPlate(plate: Plate, x: number, y: number): number {
  const qx = Math.abs(x - plate.x) - (plate.hw - plate.corner)
  const qy = Math.abs(y - plate.y) - (plate.hh - plate.corner)
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    plate.corner
  )
}

/**
 * The plate from frame to frame: whole while the face is eyes or a device,
 * drawn in to a ball while its matter is one, and out again after. It
 * remembers the ball it had, so it opens from where that was.
 */
export class PlateMotion {
  private amount = 0
  private ball: Ball | undefined
  private laid = ''
  plate: Plate

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    this.plate = plateOf(width, height, undefined, 0)
  }

  /** The plate is whole: nothing of the face is off it. */
  get whole() {
    return this.amount === 0
  }

  /** Moves a frame on. `still` (reduced motion) takes it straight there. */
  step(ball: Ball | undefined, dt: number, still = false): Plate {
    if (ball) this.ball = ball
    const towards = ball ? 1 : 0
    this.amount = still
      ? towards
      : this.amount + (towards - this.amount) * (1 - Math.exp(-dt * RATE))
    if (Math.abs(towards - this.amount) < 0.004) this.amount = towards
    this.plate = plateOf(this.width, this.height, this.ball, this.amount)
    return this.plate
  }

  /** Gives the element behind the matter the plate's outline. `unit` is CSS pixels to a face unit. Whole, the element is left to its stylesheet. */
  lay(back: HTMLElement, unit: number) {
    const { plate, width, height } = this
    const px = (value: number) => `${(value * unit).toFixed(2)}px`
    const next = this.whole
      ? ''
      : `${px(height / 2 + plate.y - plate.hh)} ${px(width / 2 - plate.x - plate.hw)} ${px(height / 2 - plate.y - plate.hh)} ${px(width / 2 + plate.x - plate.hw)}/${px(plate.corner)}`
    if (next === this.laid) return
    this.laid = next
    const [inset = '', corner = ''] = next.split('/')
    back.style.inset = inset
    back.style.borderRadius = corner
  }
}
