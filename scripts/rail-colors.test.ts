import { describe, expect, test } from 'bun:test'
import {
  converter,
  differenceEuclidean,
  formatHex,
  inGamut,
  wcagContrast,
} from 'culori'
import type { Oklab, Oklch } from 'culori'
import { RAIL_SHIFT } from '../src/components/shell/rail-wheel'
import { maxChroma, modes, modeTokens } from './palettes'

// The rail's colours are derived in CSS (.rail-mark in styles.css) so they follow
// any theme without script. This is that derivation again, with the numbers read
// from the stylesheet, checked on the built-in palettes and on accents the
// palettes never had.
const oklch = converter('oklch')
const oklab = converter('oklab')
const distance = differenceEuclidean('oklab')
const displayable = inGamut('rgb')

const css = await Bun.file(new URL('../src/styles.css', import.meta.url)).text()
const rule = css.slice(css.indexOf('.rail-mark {'))

function constant(name: string) {
  const value = rule.match(new RegExp(`--${name}: ([\\d.]+)%?;`))?.[1]
  if (value === undefined) throw new Error(`styles.css has no --${name}`)
  return Number(value)
}

const slope = constant('rail-chroma-slope')
const top = constant('rail-chroma-top')
const tint = {
  mix: constant('rail-tint-mix') / 100,
  boost: constant('rail-tint-boost'),
}
const paper = {
  mix: constant('rail-paper-mix') / 100,
  boost: constant('rail-paper-boost'),
}

/** The most chroma every hue can show at this lightness (the CSS cap). */
const cap = (l: number) => Math.min(slope * l, top * (1 - l))

function toward(color: Oklch, ground: string, share: number): Oklab {
  const a = oklab(color)
  const b = oklab(ground)!
  return {
    mode: 'oklab',
    l: a.l * share + b.l * (1 - share),
    a: a.a * share + b.a * (1 - share),
    b: a.b * share + b.b * (1 - share),
  }
}

/** Each destination's colours for an accent on a ground, as the stylesheet derives them. */
function rail(accent: string, ground: string) {
  const a = oklch(accent)!
  return Object.fromEntries(
    Object.entries(RAIL_SHIFT).map(([name, shift]) => {
      const base: Oklch = {
        mode: 'oklch',
        l: a.l,
        c: Math.min(a.c, cap(a.l)),
        h: (a.h ?? 0) + shift,
      }
      const fill = ({ mix, boost }: { mix: number; boost: number }) => {
        const mixed = oklch(toward(base, ground, mix))
        return { ...mixed, c: mixed.c * boost }
      }
      return [name, { base, tint: fill(tint), paper: fill(paper) }]
    }),
  )
}

const names = Object.keys(RAIL_SHIFT)
const wheel = names.filter((name) => name !== 'files')

function nearestPair(colors: Array<Oklch>) {
  let nearest = Infinity
  for (let i = 0; i < colors.length; i++)
    for (let j = i + 1; j < colors.length; j++)
      nearest = Math.min(nearest, distance(colors[i]!, colors[j]!))
  return nearest
}

describe('the rail follows the theme', () => {
  test('the chroma cap is below what sRGB shows in every hue, at every accent lightness', () => {
    for (let l = 0.35; l <= 0.9; l += 0.05) {
      let least = Infinity
      for (let h = 0; h < 360; h += 2) least = Math.min(least, maxChroma(l, h))
      expect(cap(l), `L ${l.toFixed(2)}`).toBeLessThanOrEqual(least + 1e-3)
    }
  })

  test.each(modes.map((mode) => [mode.selector, mode] as const))(
    '%s: seven distinct, equally light, equally chromatic, legible colours',
    (_, mode) => {
      const tokens = modeTokens(mode)
      const ground = tokens['surface-rail']!
      const colors = rail(tokens.redwood!, ground)
      const bases = wheel.map((name) => colors[name]!.base)

      expect(nearestPair(bases)).toBeGreaterThan(0.06)
      for (const base of bases) {
        expect(base.l).toBeCloseTo(bases[0]!.l, 9)
        expect(base.c).toBeCloseTo(bases[0]!.c, 9)
        expect(displayable(base)).toBe(true)
        expect(wcagContrast(formatHex(base), ground)).toBeGreaterThanOrEqual(3)
      }
      // Home is the accent's own hue.
      expect(colors.home!.base.h).toBeCloseTo(oklch(tokens.redwood)!.h!, 9)
      // The file tree is Home's colour.
      expect(colors.files!.base).toEqual(colors.home!.base)
    },
  )

  test.each(modes.map((mode) => [mode.selector, mode] as const))(
    '%s: fills keep their hue and a real share of the accent chroma',
    (_, mode) => {
      const tokens = modeTokens(mode)
      const ground = tokens['surface-rail']!
      const groundL = oklch(ground)!.l
      for (const name of wheel) {
        const {
          base,
          tint: fill,
          paper: sheet,
        } = rail(tokens.redwood!, ground)[name]!
        // Lightness runs from the icon toward the ground: tint, then paper.
        const toGround = Math.sign(groundL - base.l)
        expect(Math.sign(fill.l - base.l)).toBe(toGround)
        expect(Math.abs(sheet.l - groundL)).toBeLessThan(
          Math.abs(fill.l - groundL),
        )
        expect(fill.c / base.c).toBeGreaterThan(0.45)
        expect(sheet.c / base.c).toBeGreaterThan(0.1)
        // The mix does not turn the hue (the ground is nearly grey).
        const turn = Math.abs(((fill.h! - base.h! + 540) % 360) - 180)
        expect(turn).toBeLessThan(25)
      }
    },
  )

  test('any accent hue gives seven distinct, in-gamut colours on a light or a dark ground', () => {
    for (const [ground, l, c] of [
      ['#f4f4f5', 0.56, 0.13],
      ['#17171a', 0.66, 0.13],
    ] as const)
      for (let h = 0; h < 360; h += 15) {
        const accent = formatHex({ mode: 'oklch', l, c, h })
        const bases = wheel.map((name) => rail(accent, ground)[name]!.base)
        expect(nearestPair(bases), `hue ${h} on ${ground}`).toBeGreaterThan(
          0.07,
        )
        for (const base of bases)
          expect(displayable(base), `hue ${h} on ${ground}`).toBe(true)
      }
  })

  test('a grey accent gives a grey rail, not an invented colour', () => {
    const bases = wheel.map((name) => rail('#777777', '#f4f4f5')[name]!.base)
    for (const base of bases) expect(base.c).toBeLessThan(0.01)
  })
})
