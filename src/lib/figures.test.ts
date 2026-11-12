// SOURCING: bun:test; lib/figures' own rule for when Theo has its visor and when its eyes are ink (docs/plans/theo-face.md, "The visor").
import { describe, expect, test } from 'bun:test'
import { VISORS, faceLook, useFigures } from './figures'

describe('Theo’s visor', () => {
  test('auto keeps the visor on a light page and drops it on a dark one', () => {
    expect(faceLook('auto', false)).toMatchObject({ visor: true, ink: false })
    expect(faceLook('auto', true)).toMatchObject({ visor: false, ink: false })
  })

  test('on is the visor in both themes, with light eyes', () => {
    expect(faceLook('on', false)).toMatchObject({ visor: true, ink: false })
    expect(faceLook('on', true)).toMatchObject({ visor: true, ink: false })
  })

  test('off is bare in both themes: light eyes on dark, ink on light', () => {
    expect(faceLook('off', true)).toMatchObject({ visor: false, ink: false })
    expect(faceLook('off', false)).toMatchObject({ visor: false, ink: true })
  })

  test('eyes are ink only where nothing dark is behind them', () => {
    for (const { value } of VISORS)
      for (const dark of [false, true]) {
        const look = faceLook(value, dark)
        expect(look.ink).toBe(!look.visor && !dark)
      }
  })

  test('matter with no plate under it is ink on a light page, whatever the setting', () => {
    for (const { value } of VISORS) {
      expect(faceLook(value, false).paper).toBe(true)
      expect(faceLook(value, true).paper).toBe(false)
    }
  })

  test('the setting starts at auto and takes each choice', () => {
    expect(useFigures.getState().visor).toBe('auto')
    for (const { value } of VISORS) {
      useFigures.getState().setVisor(value)
      expect(useFigures.getState().visor).toBe(value)
    }
    useFigures.getState().setVisor('auto')
  })
})
