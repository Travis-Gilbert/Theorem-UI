// SOURCING: hand-rolled. How a cell reads at each age is Theorem's own visual language for the field; there is nothing upstream to bind to
import { GHOST_FRAMES } from './life'

/** The theme colours a glyph can be lit with. */
export const TONES = ['accent', 'ink', 'muted'] as const
export type Tone = (typeof TONES)[number]

/** How far a ghost stands out when it has just died; it fades from here over GHOST_FRAMES. */
export const GHOST_WEIGHT = 0.45

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
  if (ghost > 0) return { glyph: '.', tone: 'muted', weight: (ghost / GHOST_FRAMES) * GHOST_WEIGHT }
  return undefined
}
