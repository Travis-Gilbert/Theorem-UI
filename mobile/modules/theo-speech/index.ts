// SOURCING: expo requireOptionalNativeModule (Expo Modules API); the functions modules/theo-speech/ios/TheoSpeechModule.swift defines
//
// Theo's own voice on the phone: Phonon on the Neural Engine through the
// vendored ptts Swift package, the owner's voice and the picked pace fixed in
// the exported Core ML bundle (docs/plans/theo-sound.md). Optional at runtime:
// a build without the module, or without the model folder, says so instead of
// failing to import, and speak() resolves without speaking.
import { requireOptionalNativeModule } from 'expo'

export type SpeechSupport = { route: 'phonon' | 'none'; reason: string }

type NativeSpeech = {
  support(): SpeechSupport
  speak(text: string): Promise<void>
  stop(): void
}

const native = requireOptionalNativeModule<NativeSpeech>('TheoSpeech')

export const NO_SPEECH_MODULE = "This build does not include Theo's voice."

/** Whether this build can speak as Theo, and what is missing when it cannot. */
export function speechSupport(): SpeechSupport {
  if (!native) return { route: 'none', reason: NO_SPEECH_MODULE }
  return native.support()
}

/** Reads `text` aloud in Theo's voice, resolving when the saying ends. Where there is no voice, resolves without speaking. */
export async function speak(text: string): Promise<void> {
  if (!native) return
  await native.speak(text)
}

/** Stops what Theo is saying. Detaching a screen never calls this; only an explicit stop does. */
export function stopSpeaking(): void {
  native?.stop()
}
