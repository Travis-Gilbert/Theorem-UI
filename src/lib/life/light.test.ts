import { describe, expect, test } from 'bun:test'
import { GHOST_FRAMES } from './life'
import { BLOOM, FADE, createLight, settle, shine } from './light'
import type { Light } from './light'
import { GHOST_WEIGHT, TONES } from './look'

const FRAME = 1000 / 60
const even = () => 1

/** Runs cell 0 at a steady look for `seconds`, recording its level and glyph each frame. */
function run(
  light: Light,
  age: number,
  ghost: number,
  seconds: number,
  ms = FRAME,
  stretch = even,
) {
  const frames: { level: number; glyph: string | undefined }[] = []
  for (let elapsed = 0; elapsed < seconds * 1000 - 1e-6; elapsed += ms) {
    shine(light, 0, age, ghost, ms, stretch)
    frames.push({ level: light.level[0] ?? 0, glyph: light.glyph[0] })
  }
  return frames
}

const settled = (age: number, ghost: number) => {
  const light = createLight(1)
  settle(light, 0, age, ghost)
  return light
}

const share = (light: Light, tone: (typeof TONES)[number]) =>
  light.tone[TONES.indexOf(tone)] ?? 0

const rising = (levels: number[]) =>
  levels.every((level, i) => i === 0 || level >= (levels[i - 1] ?? 0))
const falling = (levels: number[]) =>
  levels.every((level, i) => i === 0 || level <= (levels[i - 1] ?? 0))

describe('shine', () => {
  test('a birth blooms in over a fraction of a second rather than in one frame', () => {
    const frames = run(createLight(1), 1, 0, 1)
    const at = (seconds: number) =>
      frames[Math.round(seconds * 60) - 1]?.level ?? 0

    expect(frames[0]).toMatchObject({ glyph: '@' })
    expect(at(1 / 60)).toBeLessThan(0.15)
    expect(at(BLOOM)).toBeGreaterThan(0.55)
    expect(at(0.6)).toBeGreaterThan(0.95)
    expect(rising(frames.map((frame) => frame.level))).toBe(true)
  })

  test('a death fades over about a second and keeps its glyph until it is as faint as a ghost', () => {
    const light = settled(10, 0)
    const frames = run(light, 0, GHOST_FRAMES, 6)

    expect(falling(frames.map((frame) => frame.level))).toBe(true)
    expect(frames[Math.round(FADE * 15)]?.level).toBeGreaterThan(0.5)
    expect(frames[0]?.glyph).toBe('+')
    for (const frame of frames)
      if (frame.glyph === '.')
        expect(frame.level).toBeLessThan(GHOST_WEIGHT + 0.01)
    expect(frames.at(-1)?.glyph).toBe('.')
  })

  test('ageing changes the glyph at once and the light passes between the two looks without a dip', () => {
    const frames = run(settled(1, 0), 2, 0, 2)

    expect(frames[0]?.glyph).toBe('#')
    expect(falling(frames.map((frame) => frame.level))).toBe(true)
    expect(Math.min(...frames.map((frame) => frame.level))).toBeGreaterThan(
      0.8 - 0.01,
    )
  })

  test('a birth on a ghost lights up from where its dot stood', () => {
    const light = settled(0, GHOST_FRAMES)
    const frames = run(light, 1, 0, 0.5)

    expect(frames[0]?.glyph).toBe('@')
    expect(frames[0]?.level).toBeGreaterThanOrEqual(GHOST_WEIGHT)
    expect(rising(frames.map((frame) => frame.level))).toBe(true)
  })

  test('a cell that empties goes dark and lets its glyph go', () => {
    const light = settled(10, 0)
    run(light, 0, 0, 8)

    expect(light.level[0]).toBe(0)
    expect(light.glyph[0]).toBeUndefined()
  })

  test('the motion is the same at any frame rate', () => {
    const smooth = createLight(1)
    const slow = createLight(1)
    run(smooth, 1, 0, 0.3, 1000 / 120)
    run(slow, 1, 0, 0.3, 1000 / 30)

    expect(slow.level[0]).toBeCloseTo(smooth.level[0] ?? 0, 4)
  })

  test('stretch spreads cells that changed together', () => {
    const level = (stretch: number) => {
      const light = createLight(1)
      run(light, 1, 0, 0.1, FRAME, () => stretch)
      return light.level[0] ?? 0
    }

    expect(level(0.55)).toBeGreaterThan(level(1))
    expect(level(1)).toBeGreaterThan(level(1.6))
  })

  test('a newborn takes its accent at once; an ageing cell cools into ink over the fade', () => {
    const newborn = createLight(1)
    run(newborn, 1, 0, 1 / 60)
    expect(share(newborn, 'accent')).toBe(1)

    const ageing = settled(2, 0)
    run(ageing, 3, 0, 0.1)
    expect(share(ageing, 'ink')).toBeGreaterThan(0)
    expect(share(ageing, 'ink')).toBeLessThan(0.5)
    run(ageing, 3, 0, 8 * FADE)
    expect(share(ageing, 'ink')).toBe(1)
  })

  test('a settled cell stops moving and asks for no stretch', () => {
    const light = settled(10, 0)
    let asked = 0
    run(light, 10, 0, 0.5, FRAME, () => {
      asked++
      return 1
    })

    expect(asked).toBe(0)
    expect(light.level[0]).toBeCloseTo(0.6, 5)
  })
})

describe('settle', () => {
  test('puts a cell straight at its look', () => {
    const light = settled(1, 0)

    expect(light.level[0]).toBe(1)
    expect(light.glyph[0]).toBe('@')
    expect(share(light, 'accent')).toBe(1)
    expect(share(light, 'ink')).toBe(0)
  })
})
