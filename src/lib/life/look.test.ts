import { describe, expect, test } from 'bun:test'
import { GHOST_FRAMES } from './life'
import { cellLook, crossFade } from './look'

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

describe('crossFade', () => {
  const old = cellLook(40, 0)
  const ghost = cellLook(0, GHOST_FRAMES)
  const newborn = cellLook(1, 0)

  test('a newborn fades in with nothing to hand over', () => {
    expect(crossFade(undefined, newborn)).toEqual({ glyph: '@' })
  })

  test('an ageing cell hands its old glyph over instead of swapping it', () => {
    expect(crossFade(newborn, cellLook(2, 0))).toEqual({ glyph: '#', leaving: '@' })
  })

  test('a cell that just died crosses into its ghost', () => {
    expect(crossFade(old, ghost)).toEqual({ glyph: '.', leaving: old?.glyph })
  })

  test('a birth on a ghost crosses the dot into the newborn', () => {
    expect(crossFade(ghost, newborn)).toEqual({ glyph: '@', leaving: '.' })
  })

  test('a settled cell and a fading ghost keep one glyph', () => {
    expect(crossFade(old, cellLook(41, 0))).toEqual({ glyph: old?.glyph })
    expect(crossFade(cellLook(0, 1), undefined)).toEqual({ glyph: '.' })
  })

  test('an empty cell stays empty', () => {
    expect(crossFade(undefined, undefined)).toEqual({ glyph: undefined })
  })
})
