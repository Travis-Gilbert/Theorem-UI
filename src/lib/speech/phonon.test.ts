// SOURCING: bun:test with the phonon-tts package mocked (mock.module), so lib/speech/phonon's own behaviour is checked: the shipped voice registered with addVoice once the model loads, the model's own voice speaking when that registration fails, and one load and one registration shared by every call. No model is fetched and nothing is played.
import { beforeEach, describe, expect, mock, test } from 'bun:test'

/** A stand-in for the phonon-tts package. The tests steer whether the load and the addVoice succeed, and read back what each stream was asked for. */
class FakePhonon {
  static loads = 0
  static added: Array<{ name: string; source: unknown }> = []
  static streamed: Array<{ text: string; voice: string | undefined }> = []
  static failLoad = false
  static failAdd = false
  static load() {
    FakePhonon.loads++
    if (FakePhonon.failLoad) return Promise.reject(new Error('no model'))
    return Promise.resolve(new FakePhonon())
  }
  addVoice(name: string, source: unknown) {
    if (FakePhonon.failAdd) return Promise.reject(new Error('no voice'))
    FakePhonon.added.push({ name, source })
    return Promise.resolve()
  }
  stream(text: string, options: { signal: AbortSignal; voice?: string }) {
    FakePhonon.streamed.push({ text, voice: options.voice })
    const blocks = (async function* () {})()
    return { sampleRate: 24_000, blocks, done: Promise.resolve() }
  }
}
mock.module('phonon-tts', () => ({ PhononTTS: FakePhonon }))

const { phonon, resetForTest } = await import('./phonon')

const speak = (text: string) =>
  phonon.speak(text, { signal: new AbortController().signal })

describe('the phonon provider', () => {
  beforeEach(() => {
    resetForTest()
    FakePhonon.loads = 0
    FakePhonon.added = []
    FakePhonon.streamed = []
    FakePhonon.failLoad = false
    FakePhonon.failAdd = false
  })

  test('a voice that fails to register leaves the model its own', async () => {
    FakePhonon.failAdd = true
    const stream = await speak('one')
    expect(stream.sampleRate).toBe(24_000)
    expect(FakePhonon.added).toEqual([])
    expect(FakePhonon.streamed.at(-1)).toEqual({
      text: 'one',
      voice: undefined,
    })
  })

  test('a registered voice is asked for by name', async () => {
    await speak('one')
    expect(FakePhonon.added).toEqual([
      { name: 'theo', source: expect.any(String) },
    ])
    expect(FakePhonon.streamed.at(-1)).toEqual({ text: 'one', voice: 'theo' })
  })

  test('a load that fails is tried again by the next to ask', async () => {
    FakePhonon.failLoad = true
    await expect(speak('one')).rejects.toBeInstanceOf(Error)
    expect(FakePhonon.loads).toBe(1)
    FakePhonon.failLoad = false
    await speak('one')
    expect(FakePhonon.loads).toBe(2)
    expect(FakePhonon.streamed.at(-1)).toEqual({ text: 'one', voice: 'theo' })
  })

  test('every call shares one load and one registration', async () => {
    await speak('one')
    await speak('two')
    await speak('three')
    expect(FakePhonon.loads).toBe(1)
    expect(FakePhonon.added.length).toBe(1)
    expect(FakePhonon.streamed.map((s) => s.voice)).toEqual([
      'theo',
      'theo',
      'theo',
    ])
  })
})
