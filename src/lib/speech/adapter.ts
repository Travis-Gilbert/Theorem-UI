// SOURCING: @assistant-ui/react's SpeechSynthesisAdapter (speak(text) gives an utterance with a status, cancel and subscribe; the runtime's speak and stopSpeaking, and ActionBarPrimitive.Speak, drive it) over this app's provider seam (./provider) and the page's one sound graph (lib/sound/graph), which is what makes the reply audible to Theo's meter. zustand for what the button shows while a voice is fetched.
import type { SpeechSynthesisAdapter } from '@assistant-ui/react'
import { create } from 'zustand'
import { theSound } from '@/lib/sound/graph'
import type { Playback, Stream } from '@/lib/sound/graph'
import { phonon } from './phonon'
import type { Fetching, SpeechProvider } from './provider'
import { speakable } from './speakable'

/** What the page shows of its voice: who speaks, and how far a fetch of the voice has come. */
export const useVoice = create<{
  provider: SpeechProvider
  fetching: Fetching | undefined
}>(() => ({ provider: phonon, fetching: undefined }))

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

/**
 * Reads a reply aloud with whichever provider the page has, through the
 * page's sound graph. One thing is spoken at a time: speaking again stops
 * what was being said.
 */
export function speechAdapter(
  provider: () => SpeechProvider = () => useVoice.getState().provider,
  /** What makes the audio heard. The page's sound graph, unless a test says otherwise. */
  play: (stream: Stream, options: { signal: AbortSignal }) => Playback = (
    stream,
    options,
  ) => theSound().play(stream, options),
): SpeechSynthesisAdapter {
  let current: (() => void) | undefined
  return {
    speak(text) {
      current?.()
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
          const playback = play(
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
