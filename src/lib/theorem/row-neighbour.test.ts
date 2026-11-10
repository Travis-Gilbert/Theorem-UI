// SOURCING: bun:test
import { expect, test } from 'bun:test'
import { neighbour } from './row-neighbour'

test('neighbour starts at an end and stops at the other', () => {
  expect(neighbour(['a', 'b'], undefined, 1)).toBe('a')
  expect(neighbour(['a', 'b'], undefined, -1)).toBe('b')
  expect(neighbour(['a', 'b'], 'b', 1)).toBeUndefined()
})
