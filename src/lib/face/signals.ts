// SOURCING: the audio-reactive binding of visualisers and of game audio middleware (a parameter driven by a live meter, as Wwise's RTPC and FMOD's parameters do), restated for this face: a signal is a named, bounded number the page measures, and a program ties a channel to it (docs/plans/theo-sound.md). The names and bounds are this app's.

/** A number the page measures as it happens, that a program can tie a channel to. */
export interface SignalSpec {
  readonly min: number
  readonly max: number
  readonly note: string
}

/**
 * What the face can follow. The sound ones are measured from the audio the
 * page itself is playing (lib/sound): they are 0 while nothing plays, so
 * nothing that follows them moves for a flag. They never come from a
 * microphone.
 */
export const SIGNALS = {
  'sound.level': {
    min: 0,
    max: 1,
    note: 'How loud what the page is playing is, now. 0 while nothing plays.',
  },
  'sound.low': {
    min: 0,
    max: 1,
    note: 'The low end of it: the body of a voice, a bass.',
  },
  'sound.mid': {
    min: 0,
    max: 1,
    note: 'The middle of it: vowels, most of a voice.',
  },
  'sound.high': {
    min: 0,
    max: 1,
    note: 'The top of it: consonants, hiss.',
  },
  'sound.beat': {
    min: 0,
    max: 1,
    note: 'Jumps to 1 when a sound sets in (a syllable, a beat) and dies away in about a fifth of a second.',
  },
  'body.speed': {
    min: 0,
    max: 1,
    note: 'How fast the figure is moving on the page: 0 still, 1 as fast as it is thrown.',
  },
} as const satisfies Record<string, SignalSpec>

export type SignalName = keyof typeof SIGNALS
export const SIGNAL_NAMES = Object.keys(SIGNALS) as ReadonlyArray<SignalName>

export const isSignal = (name: string): name is SignalName =>
  Object.hasOwn(SIGNALS, name)

/** The signals as they stand: what was last measured, inside its bounds. */
export class Signals {
  private readonly values = new Map<string, number>()

  /** Takes measurements by name. A name that is no signal is passed over, and a value that is no number reads as the least. */
  feed(measured: Readonly<Record<string, number>>) {
    for (const [name, value] of Object.entries(measured)) {
      if (!isSignal(name)) continue
      const spec = SIGNALS[name]
      this.values.set(
        name,
        Number.isFinite(value)
          ? Math.min(spec.max, Math.max(spec.min, value))
          : spec.min,
      )
    }
  }

  read = (name: string) => this.values.get(name) ?? 0

  /** Every signal that is away from nothing, rounded: what is being measured, in numbers. */
  away(): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [name, value] of this.values)
      if (Math.abs(value) > 0.01) result[name] = Math.round(value * 100) / 100
    return result
  }
}
