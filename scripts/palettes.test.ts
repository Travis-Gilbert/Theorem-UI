import { describe, expect, test } from 'bun:test'
import { converter, wcagContrast } from 'culori'
import { PALETTES_CSS, palettesCss } from './palettes'

const oklch = converter('oklch')

/** Each mode's block of the stylesheet, as token name to value. */
function blocks(css: string): Record<string, Record<string, string>> {
  return Object.fromEntries(
    [...css.matchAll(/^(\S[^{\n]*) \{\n([\s\S]*?)\n\}/gm)].map((match) => [
      match[1],
      Object.fromEntries(
        [...match[2]!.matchAll(/--([\w-]+): ([^;]+);/g)].map((token) => [
          token[1],
          token[2],
        ]),
      ),
    ]),
  )
}

const css = await Bun.file(PALETTES_CSS).text()
const modes = blocks(css)

describe('palettes', () => {
  test('the stylesheet is what the rules make', () => {
    expect(css).toBe(palettesCss())
  })

  test('every mode sets every colour itself, so none falls back to another', () => {
    const names = Object.values(modes).map((tokens) =>
      Object.keys(tokens).sort(),
    )
    expect(names).toHaveLength(6)
    for (const set of names) expect(set).toEqual(names[0]!)
  })

  test.each([
    ['strong', ['redwood', 'teal', 'ochre']],
    ['ink', ['redwood-ink', 'teal-ink', 'ochre-ink', 'error-ink']],
    [
      'container',
      [
        'redwood-container',
        'teal-container',
        'ochre-container',
        'error-container',
      ],
    ],
    ['graph', ['graph-plan', 'graph-agent', 'graph-tag', 'graph-attachment']],
  ])(
    'the %s tier is one lightness and one chroma across its families',
    (_, names) => {
      for (const tokens of Object.values(modes)) {
        const colors = names.map((name) => oklch(tokens[name])!)
        for (const color of colors) {
          // Within what 8-bit hex can hold.
          expect(color.l).toBeCloseTo(colors[0]!.l, 2)
          expect(Math.abs(color.c - colors[0]!.c)).toBeLessThan(0.006)
        }
      }
    },
  )

  test('text and the focus ring keep their contrast', () => {
    for (const tokens of Object.values(modes)) {
      const ratio = (fore: string, back: string) =>
        wcagContrast(tokens[fore]!, tokens[back]!)
      for (const back of ['sheet-from', 'sheet-to', 'surface-raised'])
        expect(ratio('ink', back)).toBeGreaterThan(4.5)
      expect(ratio('ink-muted', 'sheet-from')).toBeGreaterThan(4.5)
      expect(ratio('on-redwood', 'redwood')).toBeGreaterThan(4.5)
      for (const family of ['redwood', 'teal', 'ochre', 'error'])
        expect(ratio(`${family}-ink`, `${family}-container`)).toBeGreaterThan(
          4.5,
        )
      expect(ratio('focus', 'surface-sidebar')).toBeGreaterThan(3)
    }
  })
})
