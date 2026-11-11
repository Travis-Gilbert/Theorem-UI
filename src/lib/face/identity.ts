// SOURCING: the reference robot's face (docs/plans/evidence/ledger.md, "Theo reference"): two solid, softly glowing rounded boxes on a dark screen, nothing else at rest. The proportions and colour here are this app's reading of it, not a copy of its artwork.
import type { FeatureDef } from './channels'

/** What Theo is before anything asks it to be otherwise. */
export interface Identity {
  /** The visor, in face units. Everything else is measured against it. */
  readonly width: number
  readonly height: number
  /** How many grains of matter the face is made of. */
  readonly grains: number
  /** Grain radius in face units at `matter.size` 1. */
  readonly grain: number
  /** The matter's colour as an OKLCH hue, chroma and lightness. */
  readonly hue: number
  readonly chroma: number
  readonly lightness: number
  readonly features: ReadonlyArray<FeatureDef>
}

export const THEO: Identity = {
  width: 100,
  height: 64,
  grains: 1200,
  grain: 1.6,
  hue: 205,
  chroma: 0.11,
  lightness: 0.9,
  features: [
    { id: 'eye.left', side: 'left' },
    { id: 'eye.right', side: 'right' },
  ],
}
