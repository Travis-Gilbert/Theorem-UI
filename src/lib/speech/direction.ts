// SOURCING: the direction layer of Theo's speech (docs/plans/theo-sound.md, "Direction, and what the engine can carry"): a reply's delivery as metadata beside its words, mapped only onto controls the engine genuinely has. The checkpoint's conditioners are num_speakers and duration_delta alone and both are fixed at load, so per utterance the levers are sampling temperature, seed, and where the reading pauses; energy leans on temperature with the values the tuning sweep tried, and a held beat splits only at an opening interjection's own comma, never mid-phrase. Segments keep two words or more because one-word requests to this model hallucinate (docs/learnings/2026-11-11-buttery-reference-voice-and-phonon-cloning.md).
import { speakable } from './speakable'

/** How hard the delivery leans. Mapped to sampling temperature, the engine's only per-utterance delivery knob. */
export type Energy = 'low' | 'even' | 'high'

/** What a reply asks of its reading. v1 is read from the reply's own shape by `directionFromReply`; later the answering model proposes it. */
export interface Direction {
  energy?: Energy
  /** Hold a beat after an opening interjection ("Oh,", "Well,") instead of reading through it. */
  held?: boolean
  /** A seed for the take, when one reading must be reproducible. */
  take?: number
}

/** One request to the provider, and the silence after it. */
export interface Segment {
  text: string
  /** Seconds of silence after this segment, before the next. */
  gap: number
  temperature: number
  seed?: number
}

/** The sweep's temperatures, by energy: consistency at the low end, variation at the high. */
export const TEMPERATURE: Record<Energy, number> = {
  low: 0.2,
  even: 0.3,
  high: 0.45,
}

/** The beat the owner's reference performance held after its interjection, in seconds. */
const BEAT = 0.35

const INTERJECTION = /^(oh|well|ah|aha|hmm|hey|wow|no|yes),/i

/**
 * v1's read of a reply: an exclamation at the end leans the energy up, and
 * an opening interjection asks for its beat. A stopgap on purpose — it only
 * reports what the reply's own punctuation already says, until the
 * answering model proposes a direction with its answer.
 */
export function directionFromReply(text: string): Direction {
  const words = speakable(text).trim()
  return {
    energy: /!\s*$/.test(words) ? 'high' : 'even',
    held: INTERJECTION.test(words),
  }
}

/**
 * A reply as a performance: one segment for an ordinary reading, two when a
 * held beat splits an opening interjection off. Every segment is the text
 * as it is read aloud; nothing is rewritten, only split at a comma the
 * reply already had.
 */
export function plan(markdown: string, direction: Direction = {}): Segment[] {
  const text = speakable(markdown).trim()
  if (text === '') return []
  const temperature = TEMPERATURE[direction.energy ?? 'even']
  const seed = direction.take
  const comma = direction.held ? text.indexOf(',') : -1
  const head = comma > 0 ? text.slice(0, comma + 1) : ''
  const rest = comma > 0 ? text.slice(comma + 1).trim() : ''
  if (INTERJECTION.test(head) && rest.split(/\s+/).length >= 2) {
    return [
      { text: head, gap: BEAT, temperature, seed },
      { text: rest, gap: 0, temperature, seed },
    ]
  }
  return [{ text, gap: 0, temperature, seed }]
}
