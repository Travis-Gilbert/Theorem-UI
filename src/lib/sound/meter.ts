// SOURCING: the envelope follower and onset picker of audio metering (a root-mean-square level on a decibel scale with a fast attack and a slower release; an onset where the fast envelope leaves the slow one behind, as energy-based onset detection does), and one-pole filters to split the level into three bands. Written against plain sample blocks so it runs without a browser. The thresholds are this app's (docs/plans/theo-sound.md).

/** What a block of sound measures as: each 0 (nothing) to 1 (as much as there is). */
export interface Measured {
  /** How loud it is. */
  level: number
  /** The low end: the body of a voice, a bass. */
  low: number
  /** The middle: vowels. */
  mid: number
  /** The top: consonants, hiss. */
  high: number
  /** 1 when a sound sets in, dying away after. */
  beat: number
}

/** Something that happened in the sound, for whoever reacts to it. */
export type SoundEvent = 'sound.start' | 'sound.stop' | 'sound.loud'

export const METER = {
  /** The quietest that counts, and the loudest, in decibels below full scale. */
  floor: -52,
  ceiling: -10,
  /** How quickly the level rises to a louder sound, and falls from one, in seconds. */
  attack: 0.018,
  release: 0.14,
  /** Where the bands part, in hertz. */
  lowBelow: 320,
  highAbove: 2600,
  /** A sound sets in when the level stands this far over where it has just been. */
  onset: 0.1,
  /** The least time between two onsets, in seconds. */
  onsetGap: 0.09,
  /** How quickly a beat dies away, in seconds. */
  beatFade: 0.055,
  /** The level that counts as sounding at all. */
  audible: 0.06,
  /** Silence for this long, with nothing left to play, is the end of it, in seconds. */
  quiet: 0.35,
  /** A level this high, this far over where it has lately been, is loud. */
  loud: 0.86,
  loudOver: 0.3,
  /** The least time between two louds, in seconds. */
  loudGap: 2,
  /** A sound has to have been going this long before a jump in it counts: its own start is not one. */
  loudAfter: 1,
} as const

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)

/** A root-mean-square amplitude on the meter's scale: 0 at the floor, 1 at the ceiling. */
export function loudness(rms: number) {
  if (!(rms > 0)) return 0
  const decibels = 20 * Math.log10(rms)
  return clamp01((decibels - METER.floor) / (METER.ceiling - METER.floor))
}

/**
 * Reads blocks of samples into a level, three bands and a beat, and says
 * when sound starts, stops and gets loud. It holds no audio: whoever plays
 * the sound hands it the latest block each frame.
 */
export class Meter {
  private readonly measured: Measured = {
    level: 0,
    low: 0,
    mid: 0,
    high: 0,
    beat: 0,
  }
  /** Where the level has just been, and where it has lately been: a quick follower of it and a slow one. */
  private recent = 0
  private lately = 0
  private sinceOnset = Infinity
  private sinceLoud = Infinity
  private silent = Infinity
  private sounding = false
  /** How long the sound has been going, in seconds. */
  private sounded = 0
  private readonly lowPass: number
  private readonly highPass: number

  constructor(readonly sampleRate: number) {
    this.lowPass = 1 - Math.exp((-2 * Math.PI * METER.lowBelow) / sampleRate)
    this.highPass = 1 - Math.exp((-2 * Math.PI * METER.highAbove) / sampleRate)
  }

  /** Whether sound has started and not yet stopped. */
  get playing() {
    return this.sounding
  }

  /**
   * Takes the latest block of samples (-1..1) and the seconds since the last
   * one. `pending` says something is still due to play, so a pause in it is
   * not the end. Returns what happened; the measurement is `read()`.
   */
  step(
    samples: Float32Array,
    seconds: number,
    pending: boolean,
  ): ReadonlyArray<SoundEvent> {
    const dt = Math.max(0, Math.min(0.25, seconds))
    let all = 0
    let low = 0
    let high = 0
    let slow = 0
    let quick = 0
    for (const sample of samples) {
      slow += (sample - slow) * this.lowPass
      quick += (sample - quick) * this.highPass
      const top = sample - quick
      all += sample * sample
      low += slow * slow
      high += top * top
    }
    const count = Math.max(1, samples.length)
    const mid = Math.max(0, all - low - high)
    const raw = {
      level: loudness(Math.sqrt(all / count)),
      low: loudness(Math.sqrt(low / count)),
      mid: loudness(Math.sqrt(mid / count)),
      high: loudness(Math.sqrt(high / count)),
    }
    const { measured } = this
    for (const band of ['level', 'low', 'mid', 'high'] as const) {
      const to = raw[band]
      const rate = to > measured[band] ? METER.attack : METER.release
      measured[band] += (to - measured[band]) * (1 - Math.exp(-dt / rate))
    }

    const events: Array<SoundEvent> = []
    this.sinceOnset += dt
    this.sinceLoud += dt
    if (this.sounding) this.sounded += dt
    if (
      raw.level - this.recent > METER.onset &&
      raw.level > METER.audible &&
      this.sinceOnset > METER.onsetGap
    ) {
      measured.beat = 1
      this.sinceOnset = 0
    } else measured.beat *= Math.exp(-dt / METER.beatFade)
    if (
      raw.level > METER.loud &&
      raw.level - this.lately > METER.loudOver &&
      this.sinceLoud > METER.loudGap &&
      this.sounding &&
      this.sounded > METER.loudAfter
    ) {
      events.push('sound.loud')
      this.sinceLoud = 0
    }
    this.recent += (raw.level - this.recent) * (1 - Math.exp(-dt / 0.11))
    this.lately += (raw.level - this.lately) * (1 - Math.exp(-dt / 0.5))

    if (raw.level > METER.audible) {
      this.silent = 0
      if (!this.sounding) {
        this.sounding = true
        this.sounded = 0
        events.unshift('sound.start')
      }
    } else {
      this.silent += dt
      if (this.sounding && !pending && this.silent > METER.quiet) {
        this.sounding = false
        events.push('sound.stop')
      }
    }
    return events
  }

  /** The measurement as it stands. */
  read(): Readonly<Measured> {
    return this.measured
  }
}
