// SOURCING: bun:test; lib/speech/perform with a provider the test supplies: segments spoken in order with their own temperatures and seeds, the gap between them as silence of the stream's own rate in 80 ms blocks, and an abort stopping before the next segment begins.
import { describe, expect, test } from 'bun:test'
import type { Segment } from './direction'
import { perform } from './perform'
import type { SpeechProvider } from './provider'

const RATE = 24_000

function provider() {
  const asked: Array<{ text: string; temperature?: number; seed?: number }> = []
  const speaker: SpeechProvider = {
    id: 'test',
    name: 'A test voice',
    keyed: false,
    speak: (text, options) => {
      asked.push({ text, temperature: options.temperature, seed: options.seed })
      const blocks = (async function* () {
        yield new Float32Array(8).fill(0.1)
      })()
      return Promise.resolve({ sampleRate: RATE, blocks })
    },
  }
  return { speaker, asked }
}

const collect = async (stream: { blocks: AsyncIterable<Float32Array> }) => {
  const out: Float32Array[] = []
  for await (const block of stream.blocks) out.push(block)
  return out
}

const signal = () => new AbortController().signal

describe('performing a plan', () => {
  test('one segment is one request and its blocks', async () => {
    const { speaker, asked } = provider()
    const stream = await perform(
      speaker,
      [{ text: 'one', gap: 0, temperature: 0.3 }],
      { signal: signal() },
    )
    const blocks = await collect(stream)
    expect(asked).toEqual([{ text: 'one', temperature: 0.3, seed: undefined }])
    expect(blocks).toEqual([new Float32Array(8).fill(0.1)])
    expect(stream.sampleRate).toBe(RATE)
  })

  test('segments keep their order, their temperatures and their seeds, with silence between', async () => {
    const { speaker, asked } = provider()
    const segments: Segment[] = [
      { text: 'Oh,', gap: 0.16, temperature: 0.3 },
      { text: 'that actually worked.', gap: 0, temperature: 0.45, seed: 23 },
    ]
    const stream = await perform(speaker, segments, { signal: signal() })
    const blocks = await collect(stream)
    expect(asked).toEqual([
      { text: 'Oh,', temperature: 0.3, seed: undefined },
      { text: 'that actually worked.', temperature: 0.45, seed: 23 },
    ])
    // The spoken block, then 0.16 s of silence in 80 ms blocks, then the next spoken block.
    expect(blocks.length).toBe(4)
    expect((blocks[1]?.length ?? 0) + (blocks[2]?.length ?? 0)).toBe(
      Math.round(0.16 * RATE),
    )
    expect(blocks[1]?.every((sample) => sample === 0)).toBe(true)
    expect(blocks[3]).toEqual(new Float32Array(8).fill(0.1))
  })

  test('an abort stops before the next segment begins', async () => {
    const { speaker, asked } = provider()
    const abort = new AbortController()
    const segments: Segment[] = [
      { text: 'one', gap: 0.08, temperature: 0.3 },
      { text: 'two', gap: 0, temperature: 0.3 },
    ]
    const stream = await perform(speaker, segments, { signal: abort.signal })
    abort.abort()
    await collect(stream)
    expect(asked.map((a) => a.text)).toEqual(['one'])
  })
})
