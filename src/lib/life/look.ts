// SOURCING: hand-rolled. How a cell reads at each age is Theorem's own visual language for the field; there is nothing upstream to bind to
import { GHOST_FRAMES } from './life'

/** Which theme colour a glyph is lit with. */
export type Tone = 'accent' | 'ink' | 'muted'

export interface Look {
  readonly glyph: string
  readonly tone: Tone
  /** 0 to 1: how far the glyph stands out from the background. */
  readonly weight: number
}

/**
 * A newborn cell arrives sharp and lit; it settles into a quieter glyph as it
 * ages, and a dead cell leaves a dot that fades over GHOST_FRAMES.
 */
export function cellLook(age: number, ghost: number): Look | undefined {
  if (age === 1) return { glyph: '@', tone: 'accent', weight: 1 }
  if (age === 2) return { glyph: '#', tone: 'accent', weight: 0.8 }
  if (age > 2 && age <= 6) return { glyph: '*', tone: 'ink', weight: 0.85 }
  if (age > 6) return { glyph: '+', tone: 'ink', weight: 0.6 }
  if (ghost > 0) return { glyph: '.', tone: 'muted', weight: (ghost / GHOST_FRAMES) * 0.45 }
  return undefined
}

/**
 * The glyph a cell shows partway (`t`, 0 to 1) through its fade from one
 * generation's look to the next. A living cell takes its new glyph at once and
 * eases toward its new weight; a cell that has just died keeps its old glyph
 * through the first half of the fade, then hands over to its ghost.
 */
export function glyphBetween(
  before: Look | undefined,
  after: Look | undefined,
  alive: boolean,
  t: number,
): string | undefined {
  if (alive || !before) return after?.glyph
  return t < 0.5 || !after ? before.glyph : after.glyph
}
