import type { RailIcon } from '@/assets/icons/streamline/rail/layers'

/**
 * Where each rail icon sits on the colour wheel, in steps from the theme's
 * accent: Home is the accent, and the destinations after it follow in the
 * rail's order. The theme decides what the wheel looks like (.rail-mark in
 * styles.css); this only says which part of it each icon takes. The file tree
 * is Home's colour.
 */
const STEPS = {
  home: 0,
  index: 1,
  pages: 2,
  vault: 3,
  spaces: 4,
  canvas: 5,
  ide: 6,
  files: 0,
} as const satisfies Record<RailIcon, number>

/** Each step is an equal share of the turn, so no two icons share a hue. */
const SHARE = 360 / (Math.max(...Object.values(STEPS)) + 1)

/** Degrees of OKLCH hue each icon is turned from the accent. */
export const RAIL_SHIFT = Object.fromEntries(
  Object.entries(STEPS).map(([name, step]) => [name, step * SHARE]),
) as Record<RailIcon, number>
