// SOURCING: phonon-tts (Gradium's Phonon text to speech, MIT OR Apache-2.0): PhononTTS.load for the model, fetched once from its pinned Hugging Face commit and kept in the browser's cache, and tts.stream for audio as it is generated in the package's own worker. Loaded on first use, so a page that never speaks never fetches it. The 31M English model is the package's default (docs/plans/theo-sound.md, "Where the voice comes from"). The voice it speaks with ships in the repo: voice-theo.safetensors, a Phonon speaker latent the owner's ears chose on 2026-11-12 (a clone of the Buttery v4+v2 join, Gradium voice KtDVnkQ8XhyVLI1w; provenance and the consent caveat in docs/learnings/2026-11-11-buttery-reference-voice-and-phonon-cloning.md). It is added to the model once the model is loaded; if adding it fails, the model's own default voice speaks. The audio leaves here a touch quicker than the model's own pace (duration_delta -0.05 at load) and with lib/speech/eq's tilt on it, both the owner's pick of 2026-11-12; neither moves the pitch.
import type { PhononTTS } from 'phonon-tts'
import type { Fetching, SpeechProvider } from './provider'
import { tilt } from './eq'
import theoVoice from './voice-theo.safetensors?url'

let model: Promise<PhononTTS> | undefined
/** The shipped voice's name once it is added; requests ask for it by this. */
let voice: string | undefined
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
        // A touch quicker than the model's own pace, fixed at load as the
        // package asks; the owner's ears picked it on 2026-11-12.
        conditions: { duration_delta: -0.05 },
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
      }).then((tts) =>
        // The shipped voice once it is added; until then, or if adding it
        // fails, the model's own default voice speaks.
        tts.addVoice('theo', theoVoice).then(
          () => {
            voice = 'theo'
            return tts
          },
          () => tts,
        ),
      ),
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

/** Lets a test forget the loaded model and the voice it registered, so each case starts before first use. */
export const resetForTest = () => {
  model = undefined
  voice = undefined
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
    const stream = tts.stream(text, { signal, voice })
    // A generation that fails says so through the blocks; nothing else waits on this.
    stream.done.catch(() => {})
    return {
      sampleRate: stream.sampleRate,
      blocks: tilt(stream.blocks, stream.sampleRate),
    }
  },
}
