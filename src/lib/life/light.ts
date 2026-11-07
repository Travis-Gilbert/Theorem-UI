// SOURCING: anime.js utils.damp (frame-rate independent exponential smoothing) carries each cell's light toward its look; when a cell gives up its glyph while its light moves is Theorem's own visual language for the field, which nothing upstream models
import { utils } from 'animejs'
import { GHOST_WEIGHT, TONES, cellLook } from './look'
import type { Look } from './look'

/**
 * What each cell of the field shows at this moment. The field steps in
 * generations; the light eases toward each generation's looks on a clock of
 * its own, so the field flows instead of changing on the beat.
 */
export interface Light {
  /** 0 to 1 per cell: how far its glyph stands out from the background. */
  readonly level: Float32Array
  /** TONES.length per cell: how much of each tone lights it, summing to 1. */
  readonly tone: Float32Array
  readonly glyph: (string | undefined)[]
}

/** Seconds a cell's light takes to cover most of the way to a brighter look: a birth blooms. */
export const BLOOM = 0.16
/** The same toward a dimmer look: ageing and death fade, so movement leaves a trail. */
export const FADE = 1
/** Below this a cell has gone dark and lets its glyph go. */
const DARK = 0.015
/** Closer than this to its look, a cell is put there and stops moving. */
const SETTLED = 0.004

export const createLight = (size: number): Light => ({
  level: new Float32Array(size),
  tone: new Float32Array(size * TONES.length),
  glyph: Array.from<string | undefined>({ length: size }),
})

const toneOf = (look: Look) => TONES.indexOf(look.tone)

/** Puts cell `i` straight at the look its `age` and `ghost` give. */
export function settle(light: Light, i: number, age: number, ghost: number) {
  const look = cellLook(age, ghost)
  light.level[i] = look?.weight ?? 0
  light.glyph[i] = look?.glyph
  const at = look ? toneOf(look) : -1
  for (let k = 0; k < TONES.length; k++)
    light.tone[i * TONES.length + k] = +(k === at)
}

/** The rate utils.damp takes for a time constant in seconds: its factor counts tenths of a millisecond. */
const rate = (seconds: number) => 1 / (100 * seconds)

/**
 * Eases cell `i` toward the look its `age` and `ghost` give, `ms` later. Light
 * rises over BLOOM and falls over FADE, each scaled by `stretch(i)` so
 * neighbours that changed on the same step still move a little apart. A living
 * cell shows its age's glyph at once and lets the light carry the change; a
 * cell that died keeps its last glyph until its light has dimmed to a ghost's,
 * so a death fades out rather than swapping to a dot.
 */
export function shine(
  light: Light,
  i: number,
  age: number,
  ghost: number,
  ms: number,
  stretch: (i: number) => number,
) {
  const look = cellLook(age, ghost)
  const goal = look?.weight ?? 0
  const level = light.level[i] ?? 0
  const at = look ? toneOf(look) : -1
  const base = i * TONES.length
  const toned = at < 0 || (light.tone[base + at] ?? 0) > 1 - SETTLED
  if (
    Math.abs(goal - level) < SETTLED &&
    toned &&
    light.glyph[i] === look?.glyph
  ) {
    if (level !== goal) settle(light, i, age, ghost)
    return
  }
  const scale = stretch(i)
  const next = utils.damp(
    level,
    goal,
    ms,
    rate((goal > level ? BLOOM : FADE) * scale),
  )
  light.level[i] = next
  if (!look) {
    if (next < DARK) settle(light, i, age, ghost)
    return
  }
  if (age > 0 || light.glyph[i] === undefined || next <= GHOST_WEIGHT + SETTLED)
    light.glyph[i] = look.glyph
  // A cell lit from darkness takes its tone at once. A newborn's accent
  // arrives with its bloom; later tones (ageing into ink, a ghost's muted)
  // drift in over the fade.
  if (level < DARK) {
    for (let k = 0; k < TONES.length; k++) light.tone[base + k] = +(k === at)
    return
  }
  const toward = rate((age === 1 ? BLOOM : FADE) * scale)
  for (let k = 0; k < TONES.length; k++)
    light.tone[base + k] = utils.damp(
      light.tone[base + k] ?? 0,
      +(k === at),
      ms,
      toward,
    )
}
