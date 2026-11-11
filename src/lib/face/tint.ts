// SOURCING: Björn Ottosson's OKLab (the sRGB to OKLab matrices, the inverse of the ones lib/face/particles' oklch uses) for a colour's hue and chroma. Which of a theme's colours the face takes its hue from is this app's rule (docs/plans/theo-face.md, "The hue follows the theme").

/** A colour as straight sRGB, each channel 0..1. */
export type Rgb = readonly [number, number, number]

/** OKLCH chroma at or above which a colour has a hue worth following. Greys and near-greys sit well under it. */
export const TINTED = 0.02

const linear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

/** A colour's OKLCH chroma and hue (degrees, 0..360). */
export function hueOf([red, green, blue]: Rgb): {
  chroma: number
  hue: number
} {
  const r = linear(red)
  const g = linear(green)
  const b = linear(blue)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bee = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const hue = (Math.atan2(bee, a) * 180) / Math.PI
  return { chroma: Math.hypot(a, bee), hue: (hue + 360) % 360 }
}

/** What a theme offers the face: a hue it names, the ground the face sits on, and its accent. */
export interface ThemeColours {
  /** `--face-hue`, when the theme names one. */
  declared?: number
  /** The page's ground (`--surface-neutral`). */
  ground?: Rgb
  /** The theme's accent (`--focus`). */
  accent?: Rgb
}

/**
 * The hue Theo's matter takes in a theme. A hue the theme names wins. Without
 * one the face takes the hue of the ground it sits on, when the ground is
 * tinted; a grey ground has no hue to follow, so it takes the accent's; a
 * theme with neither keeps `fallback`, the face's own.
 */
export function themeHue(theme: ThemeColours, fallback: number): number {
  if (theme.declared !== undefined && Number.isFinite(theme.declared))
    return ((theme.declared % 360) + 360) % 360
  for (const colour of [theme.ground, theme.accent]) {
    if (!colour) continue
    const { chroma, hue } = hueOf(colour)
    if (chroma >= TINTED) return hue
  }
  return fallback
}
