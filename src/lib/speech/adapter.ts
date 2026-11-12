// SOURCING: @assistant-ui/react's SpeechSynthesisAdapter (speak(text) gives an utterance with a status, cancel and subscribe; the runtime's speak and stopSpeaking, and ActionBarPrimitive.Speak, drive it) over this app's provider seam (./provider) and the page's one sound graph (lib/sound/graph), which is what makes the reply audible to Theo's meter. zustand for what the button shows while a voice is fetched. Safari resumes an AudioContext only from inside a user gesture (the unlock pattern at mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos), so the graph is woken in the call the press makes.
import type { SpeechSynthesisAdapter } from '@assistant-ui/react'
import { create } from 'zustand'
import { theSound } from '@/lib/sound/graph'
import type { Playback, Stream } from '@/lib/sound/graph'
import { phonon } from './phonon'
import type { Fetching, SpeechProvider } from './provider'
import { speakable } from './speakable'

/** What the page shows of its voice: who speaks, how far a fetch of the voice has come, and which reply it could not read. */
export const useVoice = create<{
  provider: SpeechProvider
  fetching: Fetching | undefined
  /** The reply whose Read aloud was pressed, until the reading that press asked for begins. */
  asked: string | undefined
  /** The reply that could not be read aloud, until something is read again. */
  failed: string | undefined
}>(() => ({
  provider: phonon,
  fetching: undefined,
  asked: undefined,
  failed: undefined,
}))

type Status = SpeechSynthesisAdapter.Status

/** Says a block has been handed on, the first time one is. */
async function* marked(
  blocks: Stream['blocks'],
  first: () => void,
): AsyncGenerator<Float32Array> {
  let told = false
  for await (const block of blocks) {
    if (!told && block.length > 0) {
      told = true
      first()
    }
    yield block
  }
}

/** What makes the audio heard. */
export type Sound = {
  play: (stream: Stream, options: { signal: AbortSignal }) => Playback
  /** Makes it ready to sound, while the press that asked is still being handled. */
  wake?: () => void
}

/** The page's sound graph. */
const pageSound: Sound = {
  play: (stream, options) => theSound().play(stream, options),
  wake: () => theSound().wake(),
}

/**
 * Reads a reply aloud with whichever provider the page has, through the
 * page's sound graph. One thing is spoken at a time: speaking again stops
 * what was being said.
 */
export function speechAdapter(
  provider: () => SpeechProvider = () => useVoice.getState().provider,
  /** The page's sound graph, unless a test says otherwise. */
  sound: Sound = pageSound,
): SpeechSynthesisAdapter {
  let current: (() => void) | undefined
  return {
    speak(text) {
      current?.()
      // The runtime calls this inside the press. The voice may take seconds to come, and by then Safari would no longer let the audio start.
      sound.wake?.()
      // Whose reading this is, so a failure can be said where it was asked for.
      const { asked } = useVoice.getState()
      useVoice.setState({ asked: undefined, failed: undefined })
      const listeners = new Set<() => void>()
      const abort = new AbortController()
      const utterance: SpeechSynthesisAdapter.Utterance = {
        status: { type: 'starting' },
        cancel: () => {
          abort.abort()
          end('cancelled')
        },
        subscribe: (callback) => {
          listeners.add(callback)
          return () => listeners.delete(callback)
        },
      }
      const set = (status: Status) => {
        if (utterance.status.type === 'ended') return
        utterance.status = status
        for (const listener of listeners) listener()
      }
      const end = (
        reason: Extract<Status, { type: 'ended' }>['reason'],
        error?: unknown,
      ) => {
        if (current === utterance.cancel) current = undefined
        if (reason === 'error' && utterance.status.type !== 'ended')
          useVoice.setState({ failed: asked })
        set({
          type: 'ended',
          reason,
          ...(error === undefined ? {} : { error }),
        })
      }
      current = utterance.cancel
      void (async () => {
        try {
          const words = speakable(text)
          if (words === '') return end('finished')
          const stream = await provider().speak(words, {
            signal: abort.signal,
            onFetching: (fetching) => useVoice.setState({ fetching }),
          })
          if (abort.signal.aborted) return
          const playback = sound.play(
            {
              sampleRate: stream.sampleRate,
              blocks: marked(stream.blocks, () => set({ type: 'running' })),
            },
            { signal: abort.signal },
          )
          end(await playback.done)
        } catch (error) {
          if (abort.signal.aborted) return end('cancelled')
          console.warn('The reply could not be read aloud.', error)
          end('error', error)
        } finally {
          useVoice.setState({ fetching: undefined })
        }
      })()
      return utterance
    },
  }
}
