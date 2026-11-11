// SOURCING: bun:test; lib/face/tint against the palettes' own colours (src/palettes.css) and the round trip through lib/face/particles' oklch.
import { describe, expect, test } from 'bun:test'
import { oklch } from './particles'
import { TINTED, hueOf, themeHue } from './tint'
import type { Rgb } from './tint'

const hex = (value: string): Rgb => {
  const n = Number.parseInt(value.slice(1), 16)
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

describe('a colour’s hue', () => {
  test('comes back from the colour oklch makes', () => {
    for (const hue of [0, 45, 164, 205, 247, 320]) {
      const found = hueOf(oklch(0.7, 0.1, hue))
      expect(Math.abs(found.hue - hue)).toBeLessThan(0.5)
      expect(found.chroma).toBeCloseTo(0.1, 2)
    }
  })

  test('a grey has no chroma to speak of', () => {
    for (const grey of ['#121212', '#222222', '#f7f7f7', '#ffffff', '#000000'])
      expect(hueOf(hex(grey)).chroma).toBeLessThan(0.001)
  })
})

describe('the hue the face takes in a theme', () => {
  test('a hue the theme names wins, wrapped into 0..360', () => {
    const ground = hex('#3b1d5e')
    expect(themeHue({ declared: 205, ground }, 10)).toBe(205)
    expect(themeHue({ declared: -30 }, 10)).toBe(330)
    expect(themeHue({ declared: 400 }, 10)).toBe(40)
  })

  test('a name that is not a number is no name', () => {
    expect(themeHue({ declared: Number.NaN }, 205)).toBe(205)
  })

  test('a tinted ground gives its own hue, whatever the accent', () => {
    const plum = hex('#2a1838')
    expect(hueOf(plum).chroma).toBeGreaterThan(TINTED)
    const hue = themeHue({ ground: plum, accent: hex('#4d9375') }, 205)
    expect(Math.abs(hue - hueOf(plum).hue)).toBeLessThan(0.001)
  })

  test('a grey ground hands over to the accent', () => {
    // Vitesse Dark: a #222222 ground and its green.
    const vitesse = themeHue(
      { ground: hex('#222222'), accent: hex('#4d9375') },
      205,
    )
    expect(vitesse).toBeGreaterThan(155)
    expect(vitesse).toBeLessThan(172)
    // Stone's dark: a ground warm by a hair, far under the line, and its teal.
    const stone = themeHue(
      { ground: hex('#141312'), accent: hex('#3ca6a8') },
      205,
    )
    expect(stone).toBeGreaterThan(190)
    expect(stone).toBeLessThan(204)
  })

  test('a theme with no colour to follow keeps the face’s own hue', () => {
    expect(themeHue({}, 205)).toBe(205)
    expect(
      themeHue({ ground: hex('#222222'), accent: hex('#808080') }, 205),
    ).toBe(205)
  })
})
