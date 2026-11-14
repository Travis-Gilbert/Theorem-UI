// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import { partTitle, showValue } from './part-text'

describe('partTitle', () => {
  test('names a data part in words, without the protocol prefix or underscores', () => {
    expect(partTitle('theorem-response_style')).toBe('Response style')
    expect(partTitle('theorem-progress')).toBe('Progress')
    expect(partTitle('theorem-usage')).toBe('Usage')
    expect(partTitle('theorem-client_operation')).toBe('Client operation')
  })

  test('keeps a name that has no prefix and falls back for an empty one', () => {
    expect(partTitle('citations')).toBe('Citations')
    expect(partTitle('theorem-')).toBe('Details')
    expect(partTitle('')).toBe('Details')
  })
})

describe('showValue', () => {
  test('prints objects indented', () => {
    expect(showValue({ a: 1, b: ['x'] })).toBe('{\n  "a": 1,\n  "b": [\n    "x"\n  ]\n}')
  })

  test('prints a bigint instead of throwing, at any depth', () => {
    const seed = 18446744073709551615n
    expect(() => JSON.stringify({ seed })).toThrow()
    expect(showValue({ run: { seed } })).toContain('18446744073709551615')
    expect(showValue(seed)).toContain('18446744073709551615')
  })

  test('prints a string as it is and nothing as an empty string', () => {
    expect(showValue('plain output')).toBe('plain output')
    expect(showValue(undefined)).toBe('')
  })
})
