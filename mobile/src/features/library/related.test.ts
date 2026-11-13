// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import type { Theorem } from '@theoremharness/sdk'
import { explicitRelated, suggestedRelated } from './related'

const link = (overrides: Partial<Theorem.FilesLink>): Theorem.FilesLink =>
  ({ from: 'A/this.md', target: 'x', resolved: 'A/x.md', kind: 'wikilink', line: 3, ...overrides }) as Theorem.FilesLink

describe('explicitRelated', () => {
  test('an outgoing wikilink says this item links to it', () => {
    expect(explicitRelated('A/this.md', [link({})], [])).toEqual([
      { path: 'A/x.md', title: 'x', how: 'This item links to it', explicit: true },
    ])
  })
  test('a heading is named', () => {
    expect(explicitRelated('A/this.md', [link({ heading: 'Scope' })], [])[0]?.how).toBe('This item links to it, under “Scope”')
  })
  test('an incoming link says it links here', () => {
    const rows = explicitRelated('A/this.md', [], [link({ from: 'A/y.md', resolved: 'A/this.md' })])
    expect(rows).toEqual([{ path: 'A/y.md', title: 'y', how: 'It links to this item', explicit: true }])
  })
  test('a path linked both ways is one row', () => {
    const rows = explicitRelated('A/this.md', [link({})], [link({ from: 'A/x.md', resolved: 'A/this.md' })])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.how).toBe('Links both ways')
  })
  test('an unresolved link has nothing to open and is left out', () => {
    expect(explicitRelated('A/this.md', [link({ resolved: undefined })], [])).toEqual([])
  })
  test('embeds and related marks have their own words', () => {
    expect(explicitRelated('p', [link({ kind: 'embed' })], [])[0]?.how).toBe('This item embeds it')
    expect(explicitRelated('p', [link({ kind: 'related' })], [])[0]?.how).toBe('This item marks it as related')
  })
})

describe('suggestedRelated', () => {
  const suggestion = (overrides: Partial<Theorem.FilesSuggestion>): Theorem.FilesSuggestion =>
    ({
      aboveThreshold: true,
      candidateId: 'c',
      generator: 'g',
      kind: 'see_also',
      reason: 'similarity',
      score: 0.5,
      targetPath: 'A/s.md',
      targetTitle: 'Similar',
      ...overrides,
    }) as Theorem.FilesSuggestion
  test('below-threshold suggestions are not shown', () => {
    expect(suggestedRelated([suggestion({ aboveThreshold: false })], 'p')).toEqual([])
  })
  test('they are never marked explicit and carry a reason', () => {
    expect(suggestedRelated([suggestion({})], 'p')).toEqual([
      { path: 'A/s.md', title: 'Similar', how: 'Similar content', explicit: false },
    ])
  })
  test('a mention quotes the text', () => {
    const [row] = suggestedRelated([suggestion({ reason: 'mention', span: { line: 2, text: 'Budget' } })], 'p')
    expect(row?.how).toBe('Mentioned in the text: “Budget”')
  })
  test('best score first', () => {
    const rows = suggestedRelated([suggestion({ score: 0.2, targetPath: 'low' }), suggestion({ score: 0.9, targetPath: 'high' })], 'p')
    expect(rows.map((row) => row.path)).toEqual(['high', 'low'])
  })
})
