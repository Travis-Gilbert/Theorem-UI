// SOURCING: Culori's WCAG contrast, sRGB gamut mapping and OKLCH interpolation.
import {
  blend,
  formatHex,
  interpolate,
  parse,
  toGamut,
  wcagContrast,
} from 'culori'

const toSrgb = toGamut('rgb', 'oklch')

/** Keep a theme's token hue where possible when its code surface changes. */
export function readableCodeColor(color: string, background: string): string {
  const token = parse(color)
  const surface = parse(background)
  if (!surface) return 'var(--ink)'
  const composite = token && blend([surface, token], 'normal', 'rgb')
  if (composite && wcagContrast(composite, surface) >= 4.5) return color
  const black = wcagContrast('#000000', background)
  const white = wcagContrast('#ffffff', background)
  const endpoint = black > white ? '#000000' : '#ffffff'
  if (!composite) return 'var(--ink)'
  const adjust = interpolate([composite, endpoint], 'oklch')
  for (let step = 1; step < 20; step++) {
    const candidate = formatHex(toSrgb(adjust(step / 20)))
    if (wcagContrast(candidate, background) >= 4.5) return candidate
  }
  return endpoint
}
