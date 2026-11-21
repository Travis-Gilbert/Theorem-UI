import { describe, expect, test } from 'bun:test'
import { canUseLiquidGlass } from './material-policy'

describe('control material compatibility', () => {
  test('does not call iOS native APIs on unsupported platforms or with reduced transparency', () => {
    const unavailable = () => { throw new Error('must not call a native capability') }
    for (const platform of ['android', 'web', 'macos']) {
      expect(canUseLiquidGlass({ platform, reduceTransparency: false, designAvailable: unavailable, apiAvailable: unavailable })).toBe(false)
    }
    expect(canUseLiquidGlass({ platform: 'ios', reduceTransparency: true, designAvailable: unavailable, apiAvailable: unavailable })).toBe(false)
  })

  test('requires both the compiled design and runtime API, falling back if either is absent', () => {
    for (const design of [false, true]) {
      for (const api of [false, true]) {
        expect(canUseLiquidGlass({ platform: 'ios', reduceTransparency: false, designAvailable: () => design, apiAvailable: () => api })).toBe(design && api)
      }
    }
  })

  test('keeps a solid usable surface when capability lookup fails', () => {
    expect(canUseLiquidGlass({ platform: 'ios', reduceTransparency: false, designAvailable: () => true, apiAvailable: () => { throw new Error('native module unavailable') } })).toBe(false)
  })
})
