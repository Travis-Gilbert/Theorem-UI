// SOURCING: a performance (lib/speech/direction) spoken as one stream: each segment is its own request to the provider, with its own temperature and seed, and the gaps between them are silence in the stream itself, so the page's one sound graph plays the whole reading back to back on its own clock and its meter hears the beats too. The graph already schedules sources gapless (lib/sound/graph); the silence is what makes a beat a beat.
import type { Stream } from '@/lib/sound/graph'
import type { Segment } from './direction'
import type { Fetching, SpeechProvider } from './provider'

/** Silence at the stream's own rate, in 80 ms blocks like the model's chunks. */
function* silence(seconds: number, sampleRate: number) {
  const total = Math.round(seconds * sampleRate)
  const block = Math.round(0.08 * sampleRate)
  for (let at = 0; at < total; at += block)
    yield new Float32Array(Math.min(block, total - at))
}

/**
 * Speaks a performance as one stream. Segments are spoken in order; an
 * abort stops before the next one begins. Needs at least one segment.
 */
export async function perform(
  provider: SpeechProvider,
  segments: Segment[],
  options: {
    signal: AbortSignal
    onFetching?: (fetching: Fetching | undefined) => void
  },
): Promise<Stream> {
  const speakOne = (segment: Segment) =>
    provider.speak(segment.text, {
      signal: options.signal,
      onFetching: options.onFetching,
      temperature: segment.temperature,
      seed: segment.seed,
    })
  const first = await speakOne(segments[0])
  const blocks = (async function* () {
    let stream = first
    for (let i = 0; i < segments.length; i++) {
      if (i > 0) {
        if (options.signal.aborted) return
        stream = await speakOne(segments[i])
      }
      yield* stream.blocks
      if (i < segments.length - 1 && segments[i].gap > 0)
        yield* silence(segments[i].gap, stream.sampleRate)
    }
  })()
  return { sampleRate: first.sampleRate, blocks }
}
