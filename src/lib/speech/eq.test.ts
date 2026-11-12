// SOURCING: bun:test; lib/speech/eq's tilt held to the gains its cookbook coefficients promise — the band and the shelf lifted by their decibels, lows left where they are — and its state carried over block boundaries, so a stream filtered in chunks is the stream filtered whole.
import { describe, expect, test } from 'bun:test'
import { tilt } from './eq'

const RATE = 24_000

const of = async function* (
  blocks: Float32Array[],
): AsyncIterable<Float32Array> {
  for (const b of blocks) yield b
}

const collect = async (stream: AsyncIterable<Float32Array>) => {
  const out: Float32Array[] = []
  for await (const b of stream) out.push(b)
  return out
}

const join = (blocks: Float32Array[]) => {
  const out = new Float32Array(blocks.reduce((n, b) => n + b.length, 0))
  let at = 0
  for (const b of blocks) {
    out.set(b, at)
    at += b.length
  }
  return out
}

/** A sine long enough for the filter to settle, in one block or in many. */
const sine = (hz: number, chunk = 0) => {
  const n = RATE / 2
  const whole = new Float32Array(n)
  for (let i = 0; i < n; i++)
    whole[i] = Math.sin((2 * Math.PI * hz * i) / RATE) * 0.3
  if (!chunk) return [whole]
  const blocks: Float32Array[] = []
  for (let at = 0; at < n; at += chunk) blocks.push(whole.slice(at, at + chunk))
  return blocks
}

/** The rms of a block's settled middle, as a stand-in for its loudness. */
const rms = (a: Float32Array) => {
  const from = Math.floor(a.length * 0.2)
  const to = Math.floor(a.length * 0.9)
  let sum = 0
  for (let i = from; i < to; i++) sum += a[i] * a[i]
  return Math.sqrt(sum / (to - from))
}

const gainAt = async (hz: number) => {
  const input = sine(hz)
  const out = join(await collect(tilt(of(input), RATE)))
  return rms(out) / rms(join(input))
}

describe('the voice tilt', () => {
  test('lifts the band and the shelf by their decibels', async () => {
    expect(await gainAt(3200)).toBeCloseTo(10 ** (2.5 / 20), 1)
    // Well above the shelf's corner, where its full gain holds; at the
    // corner itself a shelf gives half its decibels.
    const shelf = await gainAt(12_000)
    expect(shelf).toBeGreaterThan(10 ** (1.5 / 20) - 0.05)
    expect(shelf).toBeLessThan(10 ** (1.5 / 20) + 0.05)
  })
  test('leaves the low end where it is', async () => {
    expect(await gainAt(200)).toBeCloseTo(1, 1)
  })
  test('carries its state over block boundaries', async () => {
    const whole = join(await collect(tilt(of(sine(1000)), RATE)))
    const chunked = join(await collect(tilt(of(sine(1000), 2400), RATE)))
    expect(chunked.length).toBe(whole.length)
    let worst = 0
    for (let i = 0; i < whole.length; i++)
      worst = Math.max(worst, Math.abs(whole[i] - chunked[i]))
    expect(worst).toBeLessThan(1e-3)
  })
  test('lets silence through as silence', async () => {
    const [out] = await collect(tilt(of([new Float32Array(2400)]), RATE))
    expect(out).toEqual(new Float32Array(2400))
  })
})
