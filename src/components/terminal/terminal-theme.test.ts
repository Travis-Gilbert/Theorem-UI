// SOURCING: culori (a dependency) for OKLCH, WCAG contrast, CIEDE2000 and the sRGB gamut; @tanstack/highlight's githubDarkTheme for the code colours; scripts/palettes.ts for every built-in mode's tokens and for custom ones made the way a palette is.
//
// The terminal's colours, worked out from each workspace, keep pi's slate's
// relationships to GitHub Sharp and DESIGN.md's rules: text at 4.5:1 on the
// surface it is drawn on, and diff tints at GitHub Dark's diff hues.
import { describe, expect, test } from 'bun:test'
import { githubDarkTheme } from '@tanstack/highlight/themes/github-dark'
import { converter, differenceCiede2000, inGamut, wcagContrast } from 'culori'
import { modeTokens, modes } from '../../../scripts/palettes'
import {
  GITHUB_SHARP,
  SLATE,
  measure,
  terminalTheme,
  workspaceOf,
} from './terminal-theme'
import type { TerminalTheme } from './terminal-theme'

const oklch = converter('oklch')
const deltaE = differenceCiede2000()
const displayable = inGamut('rgb')

type Mode = (typeof modes)[number]
const mode = (selector: string) => modes.find((m) => m.selector === selector)!
const workspace = (m: Mode) => workspaceOf((name) => modeTokens(m)[name]!)
/** A mode with every surface `by` darker in Okhsl lightness; inks stay. */
const darker = (m: Mode, by: number): Mode => ({
  ...m,
  neutrals: Object.fromEntries(
    Object.entries(m.neutrals).map(([name, l]) => [
      name,
      name.startsWith('ink') ? l : Math.max(0.02, l - by),
    ]),
  ),
})

const WORKSPACES = {
  'GitHub Sharp': workspace(mode(':root')),
  'GitHub Sharp dark': workspace(mode('.dark')),
  Stone: workspace(mode("[data-palette='stone']")),
  'Stone dark': workspace(mode(".dark[data-palette='stone']")),
  // A person's own colours, made the way a palette is.
  'plum dark': workspace({ ...mode('.dark'), hue: 320, saturation: 0.12 }),
  'red dark': workspace({ ...mode('.dark'), hue: 25, saturation: 0.15 }),
  'green light': workspace({ ...mode(':root'), hue: 146, saturation: 0.2 }),
  'pure grey, darker': workspace({
    ...darker(mode('.dark'), 0.05),
    saturation: 0,
  }),
}
const THEMES = Object.entries(WORKSPACES).map(
  ([name, w]) => [name, terminalTheme(w)] as [string, TerminalTheme],
)

const CODE = [...new Set(Object.values(githubDarkTheme.tokens))]
const COMMENT = githubDarkTheme.tokens.comment
const below = (fgs: string[], bgs: string[]) =>
  bgs.flatMap((bg) =>
    fgs
      .map((fg) => ({ fg, bg, ratio: wcagContrast(fg, bg) }))
      .filter(({ ratio }) => ratio < 4.5),
  )
const lch = (colour: string) => oklch(colour)!
const apart = (a = 0, b = 0) => Math.abs(((a - b + 540) % 360) - 180)
/**
 * How far a hex colour can sit, in OKLab, from the colour it was rounded
 * from, at the lightness of the terminal's surfaces and rows (0.2 to 0.4):
 * 200,000 random colours there round by at most 0.0024. A rule the theme
 * holds exactly can show in its hex colours only to this.
 */
const ROUNDING = 0.0025
/** How far apart two hues sit at a chroma, in OKLab: CIE's ΔH. */
const hueGap = (c: number, a = 0, b = 0) =>
  2 * c * Math.sin((apart(a, b) * Math.PI) / 360)

test("GitHub Sharp gives back pi's slate", () => {
  expect(terminalTheme(WORKSPACES['GitHub Sharp'])).toEqual(SLATE)
})

test('GITHUB_SHARP is GitHub Sharp as measure reads it', () => {
  const light = measure(WORKSPACES['GitHub Sharp'])
  const dark = measure(WORKSPACES['GitHub Sharp dark'])
  expect(light.tint.c).toBeCloseTo(GITHUB_SHARP.tint.c, 6)
  expect(light.tint.h).toBeCloseTo(GITHUB_SHARP.tint.h, 2)
  expect(light.anchor).toBeCloseTo(GITHUB_SHARP.anchor.light, 5)
  expect(dark.anchor).toBeCloseTo(GITHUB_SHARP.anchor.dark, 5)
})

describe.each(THEMES)('in %s', (_, theme) => {
  test('every text colour reads at 4.5:1 on each surface it is drawn on', () => {
    const { ink, bright, muted, sage, gold, error } = theme
    const chrome = [ink, bright, muted, sage, gold, error]
    expect(below(chrome, [theme.bg, theme.raised])).toEqual([])
    const code = [...CODE, ink]
    expect(below(code, [theme.bg, theme.removedLine, theme.addedLine])).toEqual(
      [],
    )
    const onWords = [
      ...code.filter((colour) => colour !== COMMENT),
      theme.commentOnWords,
    ]
    expect(below(onWords, [theme.removedWords, theme.addedWords])).toEqual([])
  })

  test("a diff's tints keep GitHub Dark's diff hues", () => {
    for (const [side, github] of [
      ['removed', '#da3633'],
      ['added', '#238636'],
    ] as const)
      for (const tint of [theme[`${side}Line`], theme[`${side}Words`]]) {
        const { c, h } = lch(tint)
        expect(hueGap(c, h, lch(github).h)).toBeLessThanOrEqual(ROUNDING)
      }
  })

  test('each tint stands as far from what it sits on as on the slate, or as far as sRGB shows', () => {
    for (const side of ['removed', 'added'] as const) {
      const row = theme[`${side}Line`]
      const words = theme[`${side}Words`]
      expect(deltaE(row, theme.bg)).toBeGreaterThan(
        deltaE(SLATE[`${side}Line`], SLATE.bg) - 0.1,
      )
      const far =
        deltaE(words, row) >
        deltaE(SLATE[`${side}Words`], SLATE[`${side}Line`]) - 0.1
      const edge = !displayable({ ...lch(words), c: lch(words).c + 0.003 })
      expect({ side, far, edge }).not.toEqual({ side, far: false, edge: false })
      // Changed words are brighter than their row: lighter and more chromatic.
      expect(lch(words).l).toBeGreaterThan(lch(row).l)
      expect(lch(words).c).toBeGreaterThan(lch(row).c)
    }
  })

  test('the background is never lighter than the slate', () => {
    expect(lch(theme.bg).l).toBeLessThanOrEqual(lch(SLATE.bg).l + ROUNDING)
  })
})

test('a neutral workspace gives a neutral terminal', () => {
  const theme = terminalTheme(WORKSPACES['pure grey, darker'])
  for (const name of [
    'bg',
    'raised',
    'line',
    'ink',
    'bright',
    'muted',
  ] as const)
    expect(lch(theme[name]).c).toBeLessThan(0.002)
})

test("a tinted workspace's terminal takes its hue, turned as the slate's is from GitHub Sharp's", () => {
  const turn = lch(SLATE.bg).h! - GITHUB_SHARP.tint.h
  for (const name of [
    'Stone',
    'Stone dark',
    'plum dark',
    'red dark',
  ] as const) {
    const { tint } = measure(WORKSPACES[name])
    const { c, h } = lch(terminalTheme(WORKSPACES[name]).bg)
    expect(hueGap(c, h, tint.h + turn)).toBeLessThanOrEqual(ROUNDING)
  }
})
