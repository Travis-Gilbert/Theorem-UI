import { describe, expect, test } from 'bun:test'
import { GHOST_FRAMES } from './life'
import { cellLook } from './look'

describe('cellLook', () => {
  test('an empty cell draws nothing', () => {
    expect(cellLook(0, 0)).toBeUndefined()
  })

  test('a newborn is lit with the accent and an old cell settles into ink', () => {
    expect(cellLook(1, 0)).toEqual({ glyph: '@', tone: 'accent', weight: 1 })
    const old = cellLook(40, 0)
    expect(old?.tone).toBe('ink')
    expect(old?.weight).toBeLessThan(1)
  })

  test('a ghost fades as it counts down', () => {
    const fresh = cellLook(0, GHOST_FRAMES)?.weight ?? 0
    const faint = cellLook(0, 1)?.weight ?? 0
    expect(fresh).toBeGreaterThan(faint)
    expect(faint).toBeGreaterThan(0)
  })
})
