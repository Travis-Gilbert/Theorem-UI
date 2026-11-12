// SOURCING: the Web Audio API (one AudioContext, sources scheduled back to back on its clock for gapless streamed playback as MDN's "Advanced techniques" and phonon-tts's README both do it, an AnalyserNode tapped for the time-domain block). One graph for the whole page, so whatever speaks is heard by the same meter (lib/sound/meter) and the face never needs to know who is talking (docs/plans/theo-sound.md).
import { Meter } from './meter'
import type { Measured, SoundEvent } from './meter'

/** How a playback ended. */
export type PlaybackEnding = 'finished' | 'cancelled' | 'error'

/** One thing the page is playing. */
export interface Playback {
  /** Resolves when the last of it has sounded, or when it was cut short. */
  readonly done: Promise<PlaybackEnding>
  /** Whether any of it has reached the loudspeaker yet. */
  readonly started: () => boolean
  /** Stops it now, the part already scheduled included. */
  readonly cancel: () => void
}

/** Raw audio as it is made: mono blocks at one sample rate. */
export interface Stream {
  readonly sampleRate: number
  readonly blocks: AsyncIterable<Float32Array>
}

const SILENCE: Readonly<Measured> = {
  level: 0,
  low: 0,
  mid: 0,
  high: 0,
  beat: 0,
}
/** How far ahead of the clock the first block is put, so it is not cut: seconds. */
const LEAD = 0.06
const BLOCK = 1024

interface Voice {
  readonly sources: Set<AudioBufferSourceNode>
  /** When the last scheduled block ends, on the context's clock. */
  until: number
  /** Nothing more is coming. */
  complete: boolean
  cancelled: boolean
  began: boolean
  readonly settle: (ending: PlaybackEnding) => void
}

/**
 * The page's sound: everything it plays goes through here, to the
 * loudspeaker and past a meter. Nothing is made until something is played,
 * and the microphone is never opened: this graph has outputs only.
 */
export class SoundGraph {
  private context: AudioContext | undefined
  private analyser: AnalyserNode | undefined
  private meter: Meter | undefined
  private block = new Float32Array(BLOCK)
  private readonly voices = new Set<Voice>()
  private last: number | undefined

  /** Makes the context on first use: a browser allows one only after the person has done something. */
  private ensure() {
    if (this.context && this.analyser)
      return { context: this.context, analyser: this.analyser }
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = BLOCK
    analyser.smoothingTimeConstant = 0
    analyser.connect(context.destination)
    this.context = context
    this.analyser = analyser
    this.meter = new Meter(context.sampleRate)
    this.block = new Float32Array(analyser.fftSize)
    return { context, analyser }
  }

  /** Whether anything is playing or still due to. */
  get busy() {
    return this.voices.size > 0
  }

  /** Whether sound that has started is still playing: what somebody who starts listening now was not told. */
  get sounding() {
    return this.voices.size > 0 && (this.meter?.playing ?? false)
  }

  /**
   * Makes the page's audio ready to sound. For the moment a press is being
   * handled: Safari lets audio start only then, and what the press asked for
   * may be seconds from having anything to play.
   */
  wake() {
    try {
      void this.ensure().context.resume()
    } catch {
      // No audio here. Playing says so, where whoever asked can be told.
    }
  }

  /** Plays raw audio as it arrives. The first block sounds as soon as it is in. */
  play(stream: Stream, options: { signal?: AbortSignal } = {}): Playback {
    const { context, analyser } = this.ensure()
    void context.resume()
    let settle: (ending: PlaybackEnding) => void = () => {}
    const done = new Promise<PlaybackEnding>((resolve) => (settle = resolve))
    const voice: Voice = {
      sources: new Set(),
      until: 0,
      complete: false,
      cancelled: false,
      began: false,
      settle,
    }
    this.voices.add(voice)
    const finish = (ending: PlaybackEnding) => this.end(voice, ending)
    const cancel = () => finish('cancelled')
    if (options.signal?.aborted) cancel()
    else options.signal?.addEventListener('abort', cancel, { once: true })

    const schedule = (samples: Float32Array) => {
      if (samples.length === 0) return
      const buffer = context.createBuffer(1, samples.length, stream.sampleRate)
      buffer.getChannelData(0).set(samples)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(analyser)
      const at = Math.max(voice.until, context.currentTime + LEAD)
      source.start(at)
      voice.until = at + buffer.duration
      voice.began = true
      voice.sources.add(source)
      source.onended = () => {
        voice.sources.delete(source)
        source.disconnect()
        if (voice.complete && voice.sources.size === 0) finish('finished')
      }
    }
    void (async () => {
      try {
        for await (const samples of stream.blocks) {
          if (voice.cancelled) return
          schedule(samples)
        }
        voice.complete = true
        if (voice.sources.size === 0) finish('finished')
      } catch (error) {
        if (voice.cancelled) return
        console.warn('The sound could not be played to the end.', error)
        finish('error')
      }
    })()
    return { done, started: () => voice.began, cancel }
  }

  /** Plays an audio file: a recording, a fixture. */
  async playUrl(url: string, options: { signal?: AbortSignal } = {}) {
    const { context } = this.ensure()
    const response = await fetch(url, { signal: options.signal })
    if (!response.ok) throw new Error(`No audio at ${url}: ${response.status}.`)
    const decoded = await context.decodeAudioData(await response.arrayBuffer())
    const samples = decoded.getChannelData(0)
    return this.play(
      {
        sampleRate: decoded.sampleRate,
        blocks: (async function* () {
          yield samples
        })(),
      },
      options,
    )
  }

  /** Ends one playback: what it had scheduled is silenced, and whoever waits on it is told how it ended. */
  private end(voice: Voice, ending: PlaybackEnding) {
    if (!this.voices.delete(voice)) return
    if (ending !== 'finished') voice.cancelled = true
    for (const source of voice.sources) {
      source.onended = null
      try {
        source.stop()
      } catch {
        // Already stopped.
      }
      source.disconnect()
    }
    voice.sources.clear()
    voice.settle(ending)
  }

  /** Stops everything. */
  stop() {
    for (const voice of [...this.voices]) this.end(voice, 'cancelled')
  }

  /**
   * Measures what is sounding now. Call once a frame, with the frame's time
   * in milliseconds; it returns the levels and what happened since the last
   * call. Before anything has been played it is silence, and costs nothing.
   */
  measure(now: number): {
    readonly signals: Readonly<Measured>
    readonly events: ReadonlyArray<SoundEvent>
  } {
    const { analyser, meter } = this
    const seconds = this.last === undefined ? 0 : (now - this.last) / 1000
    this.last = now
    if (!analyser || !meter) return { signals: SILENCE, events: [] }
    // Nothing to play and nothing sounding: no need to read the graph at all.
    if (this.voices.size === 0 && !meter.playing)
      return { signals: SILENCE, events: [] }
    analyser.getFloatTimeDomainData(this.block)
    const events = meter.step(this.block, seconds, this.voices.size > 0)
    return { signals: meter.read(), events }
  }
}

let graph: SoundGraph | undefined

/** The page's one sound graph. */
export function theSound() {
  graph ??= new SoundGraph()
  return graph
}
