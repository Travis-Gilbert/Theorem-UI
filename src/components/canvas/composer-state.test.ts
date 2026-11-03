// SOURCING: bun:test over quoteRange, the locator offsets sent in spaceContext
import { describe, expect, test } from 'bun:test'
import { quoteRange } from './composer-state'

describe('quoteRange', () => {
  test('half-open offsets of the first match', () => {
    expect(quoteRange('one two two', 'two')).toEqual({ start: 4, end: 7 })
  })

  test('counts code points, not UTF-16 units', () => {
    // The emoji is two UTF-16 units and one character.
    expect(quoteRange('a\u{1F600}b quote', 'quote')).toEqual({
      start: 4,
      end: 9,
    })
  })

  test('no range for a missing or empty quote', () => {
    expect(quoteRange('text', 'absent')).toBeUndefined()
    expect(quoteRange('text', '')).toBeUndefined()
  })
})
