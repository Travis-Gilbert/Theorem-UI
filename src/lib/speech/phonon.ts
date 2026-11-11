// SOURCING: phonon-tts (Gradium's Phonon text to speech, MIT OR Apache-2.0): PhononTTS.load for the model, fetched once from its pinned Hugging Face commit and kept in the browser's cache, and tts.stream for audio as it is generated in the package's own worker. Loaded on first use, so a page that never speaks never fetches it. The 31M English model is the package's default (docs/plans/theo-sound.md, "Where the voice comes from").
import type { PhononTTS } from 'phonon-tts'
import type { Fetching, SpeechProvider } from './provider'

let model: Promise<PhononTTS> | undefined
/** How much of each file has arrived, to add up. */
const files = new Map<string, { loaded: number; total: number | null }>()
const watchers = new Set<(fetching: Fetching | undefined) => void>()

const tell = (fetching: Fetching | undefined) => {
  for (const watcher of watchers) watcher(fetching)
}

/** The model, loaded once however many ask. A load that failed is tried again by the next to ask. */
function load() {
  model ??= import('phonon-tts')
    .then(({ PhononTTS: Phonon }) =>
      Phonon.load({
        lang: 'en',
        onProgress: ({ file, loaded, total, cached }) => {
          // What the browser already holds is not being fetched.
          if (cached) return
          files.set(file, { loaded, total })
          let have = 0
          let all = 0
          let known = true
          for (const each of files.values()) {
            have += each.loaded
            if (each.total === null) known = false
            else all += each.total
          }
          tell({ loaded: have, total: known ? all : undefined })
        },
      }),
    )
    .finally(() => {
      files.clear()
      tell(undefined)
    })
  model.catch(() => {
    model = undefined
  })
  return model
}

/** Phonon, running in this browser: no key, and nothing leaves the page but the fetch of the model. */
export const phonon: SpeechProvider = {
  id: 'phonon',
  name: 'Phonon, in this browser',
  keyed: false,
  async speak(text, { signal, onFetching }) {
    if (onFetching) watchers.add(onFetching)
    let tts: PhononTTS
    try {
      tts = await load()
    } finally {
      if (onFetching) watchers.delete(onFetching)
    }
    signal.throwIfAborted()
    const stream = tts.stream(text, { signal })
    // A generation that fails says so through the blocks; nothing else waits on this.
    stream.done.catch(() => {})
    return { sampleRate: stream.sampleRate, blocks: stream }
  },
}
