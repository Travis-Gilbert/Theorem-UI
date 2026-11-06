import { describe, expect, test } from 'bun:test'
import { GHOST_FRAMES } from './life'
import { cellLook, glyphBetween } from './look'

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

describe('glyphBetween', () => {
  const old = cellLook(40, 0)
  const ghost = cellLook(0, GHOST_FRAMES)

  test('a newborn shows its own glyph from the first frame of the fade', () => {
    expect(glyphBetween(undefined, cellLook(1, 0), true, 0)).toBe('@')
    expect(glyphBetween(ghost, cellLook(1, 0), true, 0.1)).toBe('@')
  })

  test('a cell that just died keeps its glyph until halfway, then shows its ghost', () => {
    expect(glyphBetween(old, ghost, false, 0.2)).toBe(old?.glyph)
    expect(glyphBetween(old, ghost, false, 0.6)).toBe('.')
  })

  test('a fading ghost that disappears keeps its dot to the end', () => {
    expect(glyphBetween(cellLook(0, 1), undefined, false, 0.9)).toBe('.')
  })

  test('an empty cell stays empty', () => {
    expect(glyphBetween(undefined, undefined, false, 0.5)).toBeUndefined()
  })
})
