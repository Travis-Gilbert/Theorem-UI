// SOURCING: the provider seam of speech libraries (one interface, text in and audio out, behind which a model in the page or a service stands); the audio it gives is lib/sound/graph's Stream, so whatever speaks is played by the page's one graph and heard by its one meter (docs/plans/theo-sound.md). The shape is this app's.
import type { Stream } from '@/lib/sound/graph'

/** How far along a provider is with what it must fetch before it can speak: a model, a voice. */
export interface Fetching {
  /** Bytes in, and bytes in all when the server says. */
  readonly loaded: number
  readonly total: number | undefined
}

/**
 * Something that turns text into speech. A model that runs in the page is
 * one; a service the person brings a key for is another. It gives raw audio
 * as it is made, and plays nothing: playing is the page's.
 */
export interface SpeechProvider {
  readonly id: string
  /** What the person calls it. */
  readonly name: string
  /** Whether it needs a key the person brings. */
  readonly keyed: boolean
  /**
   * Speaks. Resolves when it is ready to give audio, with the audio as it
   * comes; aborting the signal stops the making of it.
   */
  readonly speak: (
    text: string,
    options: {
      signal: AbortSignal
      onFetching?: (fetching: Fetching | undefined) => void
    },
  ) => Promise<Stream>
}
