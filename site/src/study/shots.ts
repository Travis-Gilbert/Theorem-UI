// SOURCING: hand-rolled. The study's camera poses are this room's own numbers; camera-controls moves between them. Plain data, so the live room and the Remotion film share one set of poses.
import layout from './layout.json'

type Vec3 = readonly [number, number, number]

export interface Shot {
  position: Vec3
  target: Vec3
}

/** One lens for the whole room. It never zooms, so a move reads as moving through the room. */
export const FOV = 28

const add = (a: Vec3, b: Vec3, scale = 1): Vec3 => [
  a[0] + b[0] * scale,
  a[1] + b[1] * scale,
  a[2] + b[2] * scale,
]

const { screen } = layout
const centre = screen.center as unknown as Vec3
const normal = screen.normal as unknown as Vec3

/** How far from the glass the raster fills this share of the frame's height. */
const onAxis = (fill: number) =>
  screen.halfHeight / (Math.tan(((FOV / 2) * Math.PI) / 180) * fill)

export const SHOTS = {
  /** Slightly elevated, three-quarter: the computer, the book spines square on, the keyboard in the foreground, the Life behind. */
  opening: {
    position: [0.58, 0.5, 1.28],
    target: [0.075, 0.165, -0.03],
  },
  /** Square on the tube, settled, with the bezel either side. The live page frames it from the viewport instead (surfaces.ts). */
  experience: {
    position: add(centre, normal, onAxis(0.94)),
    target: centre,
  },
  /** "Licklider imagined thinking with computers": low beside the books, The Dream Machine's spine near, the tube behind it. */
  licklider: {
    position: [0.6, 0.115, 0.34],
    target: [0.12, 0.13, -0.04],
  },
  /** "Engelbart showed what people could do together through them": down over the mouse, toward the computer. */
  engelbart: {
    position: [0.43, 0.2, 0.62],
    target: [0.0, 0.1, 0.06],
  },
  /** "That idea still matters to me": up and round to the computer's other shoulder. */
  turn: {
    position: [-0.42, 0.34, 0.78],
    target: [-0.07, 0.17, 0.02],
  },
  /** On the tube's axis, still at arm's length. */
  approach: {
    position: add(centre, normal, onAxis(0.5)),
    target: centre,
  },
} as const satisfies Record<string, Shot>

export type ShotName = keyof typeof SHOTS

/**
 * The guided introduction: where the camera is headed by each second of the film.
 * Each line of the narration has its object; the last pose is the tube, which the
 * live page replaces with the framing for its own viewport.
 */
export const TOUR: readonly { at: number; shot: ShotName }[] = [
  { at: 3.0, shot: 'licklider' },
  { at: 6.9, shot: 'engelbart' },
  { at: 9.6, shot: 'turn' },
  { at: 13.4, shot: 'approach' },
  { at: 17.2, shot: 'experience' },
]
