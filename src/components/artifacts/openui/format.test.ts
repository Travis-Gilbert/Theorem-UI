import { describe, expect, test } from 'bun:test'
import { formatNumber, formatValue } from './format'

describe('numbers as an artifact shows them', () => {
  test('a whole number under ten thousand keeps every digit, ungrouped', () => {
    expect(formatNumber(2024)).toBe('2024')
    expect(formatNumber(1000)).toBe('1000')
    expect(formatNumber(42)).toBe('42')
  })

  test('a measured value keeps three significant digits', () => {
    expect(formatNumber(5.0123)).toBe('5.01')
    expect(formatNumber(1234.56)).toBe('1230')
    expect(formatNumber(0.012345)).toBe('0.0123')
  })

  test('past ten thousand a number reads compact', () => {
    expect(formatNumber(74400)).toBe('74.4K')
    expect(formatNumber(5_920_000)).toBe('5.92M')
  })

  test('a time takes the unit that keeps its digits readable', () => {
    expect(formatValue(0.5, 'ms')).toBe('500 µs')
    expect(formatValue(5010, 'ms')).toBe('5.01 s')
    expect(formatValue(71, '%')).toBe('71%')
  })
})
