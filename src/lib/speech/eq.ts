// SOURCING: the RBJ audio EQ cookbook's biquads (a peaking band and a high shelf) as one stateful pair, applied to streamed blocks so the filter rides over chunk boundaries. The amounts are the tilt the owner's ears picked on 2026-11-12 against tune2-fast05-crisp: +2.5 dB peaking at 3.2 kHz (Q 1.2) and +1.5 dB high shelf at 7 kHz — measured to raise the spectral centroid about 9% with the f0 median untouched, which is crispness without pitch (docs/learnings/2026-11-11-buttery-reference-voice-and-phonon-cloning.md).

/** One biquad's normalized coefficients and its running state. */
interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
  x1: number
  x2: number
  y1: number
  y2: number
}

const peaking = (
  sampleRate: number,
  f0: number,
  q: number,
  gain: number,
): Biquad => {
  const a = 10 ** (gain / 40)
  const w0 = (2 * Math.PI * f0) / sampleRate
  const alpha = Math.sin(w0) / (2 * q)
  const a0 = 1 + alpha / a
  return {
    b0: (1 + alpha * a) / a0,
    b1: (-2 * Math.cos(w0)) / a0,
    b2: (1 - alpha * a) / a0,
    a1: (-2 * Math.cos(w0)) / a0,
    a2: (1 - alpha / a) / a0,
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 0,
  }
}

const highShelf = (sampleRate: number, f0: number, gain: number): Biquad => {
  const a = 10 ** (gain / 40)
  const w0 = (2 * Math.PI * f0) / sampleRate
  const alpha = Math.sin(w0) * Math.SQRT1_2
  const cos = Math.cos(w0)
  const s = 2 * Math.sqrt(a) * alpha
  const a0 = a + 1 - (a - 1) * cos + s
  return {
    b0: (a * (a + 1 + (a - 1) * cos + s)) / a0,
    b1: (-2 * a * (a - 1 + (a + 1) * cos)) / a0,
    b2: (a * (a + 1 + (a - 1) * cos - s)) / a0,
    a1: (2 * (a - 1 - (a + 1) * cos)) / a0,
    a2: (a + 1 - (a - 1) * cos - s) / a0,
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 0,
  }
}

const run = (f: Biquad, input: Float32Array, out: Float32Array) => {
  for (let i = 0; i < input.length; i++) {
    const x = input[i] ?? 0
    const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2
    f.x2 = f.x1
    f.x1 = x
    f.y2 = f.y1
    f.y1 = y
    out[i] = y
  }
}

/** The voice's tilt over a stream of blocks, fresh state per call. */
export const tilt = (
  blocks: AsyncIterable<Float32Array>,
  sampleRate: number,
): AsyncIterable<Float32Array> => {
  const chain = [
    peaking(sampleRate, 3200, 1.2, 2.5),
    highShelf(sampleRate, 7000, 1.5),
  ]
  return {
    [Symbol.asyncIterator]: () => {
      const inner = blocks[Symbol.asyncIterator]()
      return {
        next: async (): Promise<IteratorResult<Float32Array>> => {
          const step = await inner.next()
          if (step.done) return { value: undefined, done: true }
          let out = step.value
          for (const f of chain) {
            const next = new Float32Array(out.length)
            run(f, out, next)
            out = next
          }
          return { value: out, done: false }
        },
        return: async (
          value?: unknown,
        ): Promise<IteratorResult<Float32Array>> => {
          await inner.return?.(value)
          return { value: undefined, done: true }
        },
      }
    },
  }
}
