// SOURCING: bun:test; @assistant-ui/react's SpeechSynthesisAdapter contract (an utterance starts, runs and ends once, and can be cancelled), checked on lib/speech/adapter with a provider and a player the test supplies: no model is fetched and nothing is played.
import { describe, expect, test } from 'bun:test'
import type { Playback, PlaybackEnding, Stream } from '@/lib/sound/graph'
import { speechAdapter, useVoice } from './adapter'
import type { SpeechProvider } from './provider'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A provider that speaks when the test lets it, a block at a time. */
function provider() {
  const asked: Array<string> = []
  const gates: Array<{
    block: (samples?: Float32Array) => void
    end: () => void
    fail: (error: unknown) => void
    aborted: () => boolean
  }> = []
  const speaker: SpeechProvider = {
    id: 'test',
    name: 'A test voice',
    keyed: false,
    speak: (text, { signal, onFetching }) => {
      asked.push(text)
      onFetching?.({ loaded: 1, total: 4 })
      const waiting: Array<IteratorResult<Float32Array> | Error> = []
      let wake = () => {}
      const push = (item: IteratorResult<Float32Array> | Error) => {
        waiting.push(item)
        wake()
      }
      gates.push({
        block: (samples = new Float32Array(8).fill(0.1)) =>
          push({ value: samples, done: false }),
        end: () => push({ value: undefined, done: true }),
        fail: (error) => push(error instanceof Error ? error : new Error('x')),
        aborted: () => signal.aborted,
      })
      const blocks: AsyncIterable<Float32Array> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            while (waiting.length === 0)
              await new Promise<void>((resolve) => (wake = resolve))
            const item = waiting.shift() as IteratorResult<Float32Array> | Error
            if (item instanceof Error) throw item
            return item
          },
        }),
      }
      return Promise.resolve({ sampleRate: 24_000, blocks })
    },
  }
  return { speaker, asked, gates }
}

/** A player that hears every block and ends as the stream does, or when it is told to stop. */
function player() {
  const heard: Array<number> = []
  const play = (stream: Stream, options: { signal: AbortSignal }): Playback => {
    let settle: (ending: PlaybackEnding) => void = () => {}
    const done = new Promise<PlaybackEnding>((resolve) => (settle = resolve))
    options.signal.addEventListener('abort', () => settle('cancelled'))
    void (async () => {
      try {
        for await (const block of stream.blocks) heard.push(block.length)
        settle('finished')
      } catch {
        settle('error')
      }
    })()
    return { done, started: () => heard.length > 0, cancel: () => {} }
  }
  return { play, heard }
}

const statuses = (utterance: {
  status: { type: string; reason?: string }
  subscribe: (callback: () => void) => () => void
}) => {
  const seen = [utterance.status.type]
  utterance.subscribe(() =>
    seen.push(
      utterance.status.reason
        ? `${utterance.status.type}:${utterance.status.reason}`
        : utterance.status.type,
    ),
  )
  return seen
}

describe('reading a reply aloud', () => {
  test('it starts, runs once audio is really on its way, and ends when the last of it has played', async () => {
    const { speaker, asked, gates } = provider()
    const { play, heard } = player()
    const utterance = speechAdapter(() => speaker, { play }).speak(
      '**Done.** See `the log`.',
    )
    const seen = statuses(utterance)
    await tick()
    expect(asked).toEqual(['Done. See the log.'])
    // The provider is ready, and nothing has sounded: it has not begun to speak.
    expect(seen).toEqual(['starting'])
    gates[0]?.block(new Float32Array(0))
    await tick()
    expect(seen).toEqual(['starting'])
    gates[0]?.block()
    await tick()
    expect(seen).toEqual(['starting', 'running'])
    gates[0]?.block()
    gates[0]?.end()
    await tick()
    await tick()
    expect(seen).toEqual(['starting', 'running', 'ended:finished'])
    expect(heard).toEqual([0, 8, 8])
    expect(useVoice.getState().fetching).toBeUndefined()
  })

  test('a reply that opens with an interjection is read as two takes, the second after the first ends', async () => {
    const { speaker, asked, gates } = provider()
    const { play } = player()
    speechAdapter(() => speaker, { play }).speak('Oh, that actually worked.')
    await tick()
    expect(asked).toEqual(['Oh,'])
    gates[0]?.end()
    await tick()
    await tick()
    expect(asked).toEqual(['Oh,', 'that actually worked.'])
  })

  test('stopped, it ends as cancelled, tells the provider, and says nothing after', async () => {
    const { speaker, gates } = provider()
    const { play } = player()
    const utterance = speechAdapter(() => speaker, { play }).speak(
      'A long reply.',
    )
    const seen = statuses(utterance)
    await tick()
    gates[0]?.block()
    await tick()
    utterance.cancel()
    expect(gates[0]?.aborted()).toBe(true)
    await tick()
    gates[0]?.block()
    gates[0]?.end()
    await tick()
    expect(seen).toEqual(['starting', 'running', 'ended:cancelled'])
  })

  test('one thing is said at a time: speaking again stops what was being said', async () => {
    const { speaker, gates } = provider()
    const { play } = player()
    const adapter = speechAdapter(() => speaker, { play })
    const first = adapter.speak('The first reply.')
    const firstSeen = statuses(first)
    await tick()
    gates[0]?.block()
    await tick()
    const second = adapter.speak('The second reply.')
    const secondSeen = statuses(second)
    await tick()
    expect(firstSeen.at(-1)).toBe('ended:cancelled')
    expect(gates[0]?.aborted()).toBe(true)
    gates[1]?.block()
    gates[1]?.end()
    await tick()
    await tick()
    expect(secondSeen).toEqual(['starting', 'running', 'ended:finished'])
    // The first one ending late does not end the second.
    expect(
      firstSeen.filter((status) => status.startsWith('ended')),
    ).toHaveLength(1)
  })

  test('a provider that cannot speak ends it as an error', async () => {
    const failing: SpeechProvider = {
      id: 'broken',
      name: 'Broken',
      keyed: false,
      speak: () => Promise.reject(new Error('No voice.')),
    }
    const warn = console.warn
    console.warn = () => {}
    try {
      const utterance = speechAdapter(() => failing, player()).speak('Hi.')
      const seen = statuses(utterance)
      await tick()
      await tick()
      expect(seen).toEqual(['starting', 'ended:error'])
    } finally {
      console.warn = warn
    }
  })

  test('a reading that fails is said of the reply it was asked for, until something is read again', async () => {
    const failing: SpeechProvider = {
      id: 'broken',
      name: 'Broken',
      keyed: false,
      speak: () => Promise.reject(new Error('No voice.')),
    }
    const warn = console.warn
    console.warn = () => {}
    try {
      // The button says which reply it is on, then the runtime asks the adapter.
      useVoice.setState({ asked: 'reply-1' })
      speechAdapter(() => failing, player()).speak('Hi.')
      expect(useVoice.getState().asked).toBeUndefined()
      await tick()
      await tick()
      expect(useVoice.getState().failed).toBe('reply-1')

      // A voice that breaks off part way is the same failure.
      const { speaker, gates } = provider()
      const adapter = speechAdapter(() => speaker, player())
      useVoice.setState({ asked: 'reply-2' })
      adapter.speak('A reply.')
      expect(useVoice.getState().failed).toBeUndefined()
      await tick()
      gates[0]?.block()
      gates[0]?.fail(new Error('Cut off.'))
      await tick()
      await tick()
      expect(useVoice.getState().failed).toBe('reply-2')

      // Stopping one is not a failure.
      useVoice.setState({ asked: 'reply-3' })
      const stopped = adapter.speak('Another reply.')
      await tick()
      stopped.cancel()
      await tick()
      expect(useVoice.getState().failed).toBeUndefined()
    } finally {
      console.warn = warn
    }
  })

  test('the sound is woken in the call the press makes, before the voice is asked for', async () => {
    const { speaker, asked, gates } = provider()
    const order: Array<string> = []
    const { play } = player()
    const adapter = speechAdapter(
      () => ({
        ...speaker,
        speak: (text, options) => {
          order.push('voice')
          return speaker.speak(text, options)
        },
      }),
      { play, wake: () => order.push('woken') },
    )
    adapter.speak('Hello.')
    // Nothing has been awaited yet: this much is still inside the press.
    expect(order).toEqual(['woken', 'voice'])
    await tick()
    expect(asked).toEqual(['Hello.'])
    gates[0]?.end()
    await tick()
  })

  test('a reply with nothing to read ends at once, and the provider is not asked', async () => {
    const { speaker, asked } = provider()
    const utterance = speechAdapter(() => speaker, player()).speak('```ts\n```')
    const seen = statuses(utterance)
    await tick()
    expect(asked).toEqual(['A block of code.'])
    expect(seen[0]).toBe('starting')
    const empty = speechAdapter(() => speaker, player()).speak('\n\n')
    const emptySeen = statuses(empty)
    await tick()
    expect(asked).toHaveLength(1)
    expect([empty.status.type, ...emptySeen]).toContain('ended')
  })
})
