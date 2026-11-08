// SOURCING: hand-rolled. Exponential smoothing of a per-cell level toward a target is a few lines of arithmetic; no library models it per cell on a typed array. The look of a cell lives here too, so the film's seeded run and the live field cannot drift apart.
import type { Sim } from './sim'

/** Seconds for a cell's level to close 63% of the gap to alive, and to dead. A cell is born within a generation and takes several to fade. */
export const TAU_RISE = 0.18
export const TAU_FALL = 1.1
/** Seconds for a fading cell to turn to gold, and for one that comes back to turn to ink again. Both are well inside TAU_FALL, so a death is seen in gold. */
export const TAU_GILD = 0.16
export const TAU_INK = 0.1
/** The most any one level may move in one frame, as a share of full scale. Easing alone stays under it; this makes it a guarantee. */
export const MAX_STEP = 0.1
/** Frames longer than this (a throttled or resumed tab) are treated as this long, so a level never jumps. */
export const MAX_DT = 1 / 30

/** Moves every level toward its target. */
export function ease(
  level: Float32Array,
  target: Float32Array,
  seconds: number,
) {
  const dt = Math.min(seconds, MAX_DT)
  const rise = 1 - Math.exp(-dt / TAU_RISE)
  const fall = 1 - Math.exp(-dt / TAU_FALL)
  for (let i = 0; i < level.length; i++) {
    const was = level[i] ?? 0
    const goal = target[i] ?? 0
    const gap = goal - was
    if (gap === 0) continue
    let move = gap * (gap > 0 ? rise : fall)
    if (move > MAX_STEP) move = MAX_STEP
    else if (move < -MAX_STEP) move = -MAX_STEP
    level[i] = Math.abs(gap) < 0.004 ? goal : was + move
  }
}

/** A cell is ink while it lives and turns to gold as it dies. */
export function gild(
  gilt: Float32Array,
  level: Float32Array,
  target: Float32Array,
  seconds: number,
) {
  const dt = Math.min(seconds, MAX_DT)
  const toGold = 1 - Math.exp(-dt / TAU_GILD)
  const toInk = 1 - Math.exp(-dt / TAU_INK)
  for (let i = 0; i < gilt.length; i++) {
    const was = gilt[i] ?? 0
    const fading = (target[i] ?? 0) < (level[i] ?? 0)
    if (!fading && was === 0) continue
    const now = fading ? was + (1 - was) * toGold : was * (1 - toInk)
    gilt[i] = now < 0.004 ? 0 : now
  }
}

export type Rgb = readonly [number, number, number]

/** Generations a second: slow enough to watch a colony grow. */
export const PACE = 4
/** Levels below this are not drawn. */
export const VISIBLE = 0.03
/** The level at which what a dead cell leaves behind goes from : to . */
const TRACE_STEP = 0.3
/** How much sooner a gilded cell reaches full strength than an ink one: gold is paler than ink, so it needs more of itself to show. */
const GILT_HOLD = 0.3
/** Generations run before the first frame, so a field opens mid-growth. The last few are eased like live ones, so a held field has its gold too. */
const SETTLE_TICKS = 60
const SETTLE_EASED = 14

export const mix = (from: Rgb, to: Rgb, weight: number): Rgb => [
  from[0] + (to[0] - from[0]) * weight,
  from[1] + (to[1] - from[1]) * weight,
  from[2] + (to[2] - from[2]) * weight,
]

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export interface FieldPalette {
  paper: Rgb
  faint: Rgb
  ink: Rgb
  gold: Rgb
}

export const fieldPalette = (paper: Rgb, ink: Rgb, gold: Rgb): FieldPalette => ({
  paper,
  faint: mix(ink, paper, 0.62),
  ink,
  gold,
})

/** A living cell is a slate o. What it leaves behind is a : and then a . that fade in gold. */
export function cellLook(
  v: number,
  living: boolean,
  gilt: number,
  { paper, faint, ink, gold }: FieldPalette,
) {
  const tone = mix(mix(faint, ink, smooth(0.45, 1, v)), gold, gilt)
  return {
    glyph: living ? 'o' : v >= TRACE_STEP ? ':' : '.',
    color: mix(paper, tone, smooth(VISIBLE, 0.7 - GILT_HOLD * gilt, v)),
  }
}

/** Runs the sim ahead, so the first frame is a field already growing and not a few fresh seeds. */
export function settle(sim: Sim, level: Float32Array, gilt: Float32Array) {
  for (let n = 0; n < SETTLE_TICKS; n++) {
    sim.tick()
    if (n < SETTLE_TICKS - SETTLE_EASED) continue
    const frames = Math.round(1 / PACE / MAX_DT)
    for (let f = 0; f < frames; f++) {
      gild(gilt, level, sim.target, MAX_DT)
      ease(level, sim.target, MAX_DT)
    }
  }
}
