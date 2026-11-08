// SOURCING: hand-rolled. The film's clock: the brief's storyboard in frames, set against the measured narration. Captions and the transcript are generated from this file.
export const FPS = 30
export const DURATION = 600

/** Half-open frame ranges. The history takes the first seven and a half seconds. */
export const SCENES = {
  symbiosis: [0, 104],
  nls: [104, 222],
  turn: [222, 282],
  typing: [282, 360],
  answer: [360, 432],
  followUp: [432, 468],
  outcome: [468, 540],
  final: [540, 600],
} as const

export type Span = readonly [number, number]
export const length = ([from, to]: Span) => to - from

/** Each line's place in the film. `audio` is one clip per line until a founder take replaces them. */
export const PHRASES = [
  {
    text: 'Licklider imagined thinking with computers.',
    from: 6,
    to: 99,
    audio: 'narration/scratch-1.wav',
  },
  {
    text: 'Engelbart showed what people could do together through them.',
    from: 108,
    to: 215,
    audio: 'narration/scratch-2.wav',
  },
  {
    text: 'That idea still matters to me: technology that expands what we can understand, try, and create.',
    from: 224,
    to: 443,
    audio: 'narration/scratch-3.wav',
  },
  {
    text: "I'm building Theorem to bring that partnership into everyday life.",
    from: 448,
    to: 578,
    audio: 'narration/scratch-4.wav',
  },
] as const

/** The third line is too long for one caption, and it breaks where the voice does. */
export const CUES = [
  { text: 'Licklider imagined thinking with computers.', from: 6, to: 101 },
  {
    text: 'Engelbart showed what people could do together through them.',
    from: 108,
    to: 217,
  },
  { text: 'That idea still matters to me:', from: 224, to: 288 },
  {
    text: 'technology that expands what we can understand, try, and create.',
    from: 288,
    to: 445,
  },
  {
    text: "I'm building Theorem to bring that partnership into everyday life.",
    from: 448,
    to: 582,
  },
] as const
