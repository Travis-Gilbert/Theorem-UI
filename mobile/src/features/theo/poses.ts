// SOURCING: ./core (the Face engine run without a page, its outline of each feature)
//
// Still poses of Theo for places that cannot run the particles: a Live
// Activity, a control, a widget (docs/plans/theo-iphone.md §2). A pose is not
// drawn by hand. It is the core's own face, settled into the mood its engine
// gives a liveness, and read off as outlines.
import { Face, plainGaze, seatPoint, THEO, type Liveness, type Shape } from './core'

export type Pose = {
  liveness: Liveness
  /** Face units: the visor is `width` by `height`, centred on the origin. */
  width: number
  height: number
  /** One closed outline per visible feature, as x,y pairs. */
  outlines: number[][]
}

const TAU = Math.PI * 2
/** Long enough for a mood's springs to come to rest. */
const SETTLE_MS = 2_400
const STEP_MS = 8

function outline(shape: Shape, steps: number): number[] {
  const point = [0, 0]
  const out: number[] = []
  for (let step = 0; step < steps; step++) {
    seatPoint(shape, (step / steps) * TAU, 1, point, 0)
    out.push(Math.round(point[0]! * 100) / 100, Math.round(point[1]! * 100) / 100)
  }
  return out
}

/** The same seed and clock every time, so a pose is the same on every device and build. */
export function poseFor(liveness: Liveness, steps = 24): Pose {
  let now = 1_700_000_000_000
  const face = new Face({ seed: 7, clock: () => now })
  face.attach({ gazeAt: plainGaze, go: () => {}, burst: () => {} })
  face.setLiveness(liveness)
  for (let t = 0; t < SETTLE_MS; t += STEP_MS) {
    now += STEP_MS
    face.advance(STEP_MS / 1000)
  }
  return {
    liveness,
    width: THEO.width,
    height: THEO.height,
    outlines: face
      .shapesNow()
      .filter((shape) => shape.alpha > 0.05 && shape.w > 0 && shape.h > 0)
      .map((shape) => outline(shape, steps)),
  }
}

export const POSE_LIVENESS: Liveness[] = ['idle', 'attend', 'work', 'ask', 'done']

/** One eye as a rounded box, for surfaces that have rectangles but no paths (a Live Activity). */
export type EyeBox = { w: number; h: number; r: number }

/**
 * The pose reduced to boxes: each outline's bounding box, in units of the
 * visor's height, left to right. A lid that has come down shows as a shorter
 * box, so the pose still reads without the outline.
 */
export function eyeBoxes(pose: Pose): EyeBox[] {
  return pose.outlines
    .map((outline) => {
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (let i = 0; i < outline.length; i += 2) {
        minX = Math.min(minX, outline[i]!)
        maxX = Math.max(maxX, outline[i]!)
        minY = Math.min(minY, outline[i + 1]!)
        maxY = Math.max(maxY, outline[i + 1]!)
      }
      const w = (maxX - minX) / pose.height
      const h = (maxY - minY) / pose.height
      const round2 = (value: number) => Math.round(value * 100) / 100
      return { x: minX, w: round2(w), h: round2(h), r: round2(Math.min(w, h) * 0.3) }
    })
    .sort((a, b) => a.x - b.x)
    .map(({ w, h, r }) => ({ w, h, r }))
}
