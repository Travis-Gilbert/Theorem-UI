// SOURCING: culori (a dependency) for OKLCH and WCAG contrast; @tanstack/highlight's githubDarkTheme for the code colours. The test only reads the crate's colour constants.
//
// The terminal crate draws in fixed colours. These checks hold them to
// DESIGN.md's rules: text at 4.5:1 on the surface it is drawn on, and the
// diff tints set in OKLCH at GitHub Dark's diff hues.
import { readFileSync } from 'node:fs'
import { expect, test } from 'bun:test'
import { githubDarkTheme } from '@tanstack/highlight/themes/github-dark'
import { converter, differenceCiede2000, wcagContrast } from 'culori'

const oklch = converter('oklch')
const deltaE = differenceCiede2000()

const source = readFileSync(
  new URL('../../../terminal/src/lib.rs', import.meta.url),
  'utf8',
)
const colour: Record<string, string> = {}
for (const [, name, r, g, b] of source.matchAll(
  /const (\w+): Color = Color::Rgb\(0x(\w\w), 0x(\w\w), 0x(\w\w)\);/g,
))
  colour[name!] = `#${r}${g}${b}`.toLowerCase()

const CHROME = ['INK', 'BRIGHT', 'MUTED', 'SAGE', 'GOLD', 'ERROR']
const CODE = [
  'RED',
  'PURPLE',
  'BLUE',
  'LIGHT_BLUE',
  'ORANGE',
  'GREEN',
  'GREY',
  'LINK_BLUE',
  'INK',
]

const below = (fgs: string[], bgs: string[]) =>
  bgs.flatMap((bg) =>
    fgs
      .map((fg) => ({ fg, bg, ratio: wcagContrast(colour[fg]!, colour[bg]!) }))
      .filter(({ ratio }) => ratio < 4.5),
  )

test("code draws in GitHub Dark's token colours, which Stone dark's Monaco uses", () => {
  const byClass: Record<string, string> = {
    keyword: 'RED',
    function: 'PURPLE',
    number: 'BLUE',
    string: 'LIGHT_BLUE',
    type: 'ORANGE',
    tag: 'GREEN',
    comment: 'GREY',
    link: 'LINK_BLUE',
  }
  for (const [cls, name] of Object.entries(byClass))
    expect(colour[name]).toBe(
      githubDarkTheme.tokens[cls as keyof typeof githubDarkTheme.tokens],
    )
})

test('every text colour reads at 4.5:1 on each surface it is drawn on', () => {
  expect(below(CHROME, ['BG', 'RAISED'])).toEqual([])
  expect(below(CODE, ['BG', 'REMOVED_LINE', 'ADDED_LINE'])).toEqual([])
  const onWords = [
    ...CODE.filter((name) => name !== 'GREY'),
    'COMMENT_ON_WORDS',
  ]
  expect(below(onWords, ['REMOVED_WORDS', 'ADDED_WORDS'])).toEqual([])
})

test("a diff's tints keep GitHub Dark's diff hues, with removed and added alike in lightness and chroma", () => {
  const at = (name: string) => {
    const parsed = oklch(colour[name])
    if (!parsed) throw new Error(`terminal/src/lib.rs has no colour ${name}`)
    return parsed
  }
  const hue = (hex: string) => oklch(hex)!.h!
  const apart = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
  for (const [side, github] of [
    ['REMOVED', '#da3633'],
    ['ADDED', '#238636'],
  ] as const) {
    const row = at(`${side}_LINE`)
    const words = at(`${side}_WORDS`)
    expect(apart(row.h!, hue(github))).toBeLessThan(2)
    expect(apart(words.h!, hue(github))).toBeLessThan(2)
    // Changed words are brighter than their row: lighter and more chromatic.
    expect(words.l).toBeGreaterThan(row.l)
    expect(words.c).toBeGreaterThan(row.c * 2)
  }
  for (const kind of ['LINE', 'WORDS']) {
    const removed = at(`REMOVED_${kind}`)
    const added = at(`ADDED_${kind}`)
    expect(Math.abs(removed.l - added.l)).toBeLessThan(0.003)
    expect(Math.abs(removed.c - added.c)).toBeLessThan(0.003)
  }
})

test('changed words stand apart from a row that stays quiet on the slate', () => {
  // ΔE00 on GitHub Dark, removed / added: a row against its background
  // 11.0 / 14.1, changed words against their row 19.0 / 14.6.
  for (const side of ['REMOVED', 'ADDED']) {
    const row = colour[`${side}_LINE`]!
    expect(deltaE(row, colour.BG!)).toBeLessThan(14.5)
    expect(deltaE(colour[`${side}_WORDS`]!, row)).toBeGreaterThan(15)
  }
})
