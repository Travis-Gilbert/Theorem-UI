// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import { recency } from './time'

const now = new Date(2026, 10, 12, 12, 0, 0).getTime()
const ago = (ms: number) => recency(now - ms, now)

describe('recency', () => {
  test('under a minute is Just now', () => expect(ago(10_000)).toBe('Just now'))
  test('minutes', () => expect(ago(12 * 60_000)).toBe('12 minutes ago'))
  test('hours', () => expect(ago(3 * 3_600_000)).toBe('3 hours ago'))
  test('days within a week', () => expect(ago(3 * 86_400_000)).toBe('3 days ago'))
  test('older this year is a calendar date', () => expect(ago(20 * 86_400_000)).toBe('Oct 23'))
  test('older than this year names the year', () =>
    expect(recency(new Date(2025, 5, 3).getTime(), now)).toBe('Jun 3, 2025'))
})
