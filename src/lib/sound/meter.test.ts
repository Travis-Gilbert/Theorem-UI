// SOURCING: bun:test; lib/sound/meter's own thresholds, checked against tones the test makes (a sine at a known pitch and loudness), so no audio device is needed.
import { describe, expect, test } from 'bun:test'
import { METER, Meter, loudness } from './meter'
import type { SoundEvent } from './meter'

const RATE = 48_000
const BLOCK = 1024
const FRAME = 1 / 60

/** A block of a sine at `hertz`, `amplitude` high. */
const tone = (hertz: number, amplitude: number, from = 0) =>
  Float32Array.from(
    { length: BLOCK },
    (_, index) =>
      amplitude * Math.sin((2 * Math.PI * hertz * (from + index)) / RATE),
  )
const SILENCE = new Float32Array(BLOCK)

/** Feeds a meter the same kind of block for some seconds, a frame at a time; says what happened. */
const feed = (
  meter: Meter,
  seconds: number,
  block: (frame: number) => Float32Array,
  pending = true,
) => {
  const events: Array<SoundEvent> = []
  for (let frame = 0; frame * FRAME < seconds; frame++)
    events.push(...meter.step(block(frame), FRAME, pending))
  return events
}

describe('loudness', () => {
  test('nothing is 0, the ceiling and over is 1, and between is by decibels', () => {
    expect(loudness(0)).toBe(0)
    expect(loudness(NaN)).toBe(0)
    expect(loudness(10 ** (METER.floor / 20))).toBeCloseTo(0, 5)
    expect(loudness(10 ** (METER.ceiling / 20))).toBeCloseTo(1, 5)
    expect(loudness(1)).toBe(1)
    const middle = (METER.floor + METER.ceiling) / 2
    expect(loudness(10 ** (middle / 20))).toBeCloseTo(0.5, 5)
  })
})

describe('meter', () => {
  test('silence is nothing, and nothing happens', () => {
    const meter = new Meter(RATE)
    expect(feed(meter, 2, () => SILENCE)).toEqual([])
    expect(meter.playing).toBe(false)
    expect(meter.read()).toEqual({ level: 0, low: 0, mid: 0, high: 0, beat: 0 })
  })

  test('a sound starts once, and its level follows how loud it is', () => {
    const meter = new Meter(RATE)
    const events = feed(meter, 1, (frame) => tone(440, 0.05, frame * BLOCK))
    expect(events).toEqual(['sound.start'])
    expect(meter.playing).toBe(true)
    const soft = meter.read().level
    feed(meter, 1, (frame) => tone(440, 0.2, frame * BLOCK))
    expect(meter.read().level).toBeGreaterThan(soft + 0.2)
  })

  test('each band hears its own part of the sound', () => {
    const heard = (hertz: number) => {
      const meter = new Meter(RATE)
      feed(meter, 1, (frame) => tone(hertz, 0.2, frame * BLOCK))
      return meter.read()
    }
    const bass = heard(90)
    expect(bass.low).toBeGreaterThan(bass.mid)
    expect(bass.low).toBeGreaterThan(bass.high)
    const vowel = heard(900)
    expect(vowel.mid).toBeGreaterThan(vowel.low)
    expect(vowel.mid).toBeGreaterThan(vowel.high)
    const hiss = heard(9_000)
    expect(hiss.high).toBeGreaterThan(hiss.low)
    expect(hiss.high).toBeGreaterThan(hiss.mid)
  })

  test('a pause with more to come is not the end; silence with nothing left is, once', () => {
    const meter = new Meter(RATE)
    feed(meter, 0.5, (frame) => tone(440, 0.2, frame * BLOCK))
    expect(feed(meter, 3, () => SILENCE, true)).toEqual([])
    expect(meter.playing).toBe(true)
    // Nothing left: the end comes after the quiet it takes to be sure, and not before.
    expect(feed(meter, METER.quiet * 0.5, () => SILENCE, true)).toEqual([])
    const before = new Meter(RATE)
    feed(before, 0.5, (frame) => tone(440, 0.2, frame * BLOCK))
    expect(feed(before, METER.quiet * 0.6, () => SILENCE, false)).toEqual([])
    expect(feed(before, METER.quiet, () => SILENCE, false)).toEqual([
      'sound.stop',
    ])
    expect(before.playing).toBe(false)
    expect(feed(before, 2, () => SILENCE, false)).toEqual([])
    // And it can start again.
    expect(feed(before, 0.2, (frame) => tone(440, 0.2, frame * BLOCK))).toEqual(
      ['sound.start'],
    )
  })

  test('a sound setting in is a beat that dies away, and a held one is not another', () => {
    const meter = new Meter(RATE)
    meter.step(tone(440, 0.3), FRAME, true)
    expect(meter.read().beat).toBe(1)
    feed(meter, 0.5, (frame) => tone(440, 0.3, (frame + 1) * BLOCK))
    expect(meter.read().beat).toBeLessThan(0.01)
    // A syllable after a gap is one again.
    feed(meter, 0.3, () => SILENCE)
    meter.step(tone(440, 0.3), FRAME, true)
    expect(meter.read().beat).toBe(1)
  })

  test('a jump well over where it has been is loud, and not again straight after', () => {
    const meter = new Meter(RATE)
    feed(meter, 2, (frame) => tone(440, 0.02, frame * BLOCK))
    const jump = feed(meter, 0.5, (frame) => tone(440, 0.9, frame * BLOCK))
    expect(jump).toEqual(['sound.loud'])
    feed(meter, 0.3, (frame) => tone(440, 0.02, frame * BLOCK))
    expect(feed(meter, 0.3, (frame) => tone(440, 0.9, frame * BLOCK))).toEqual(
      [],
    )
  })

  test('a sound that has been loud all along is not a jump', () => {
    const meter = new Meter(RATE)
    const events = feed(meter, 4, (frame) => tone(440, 0.9, frame * BLOCK))
    expect(events).toEqual(['sound.start'])
  })

  test('a long gap between frames is read as a short one', () => {
    const meter = new Meter(RATE)
    feed(meter, 0.5, (frame) => tone(440, 0.2, frame * BLOCK))
    // A tab left in the background comes back with one long frame: not, by itself, the end.
    expect(meter.step(SILENCE, 30, false)).toEqual([])
    expect(meter.playing).toBe(true)
  })
})
