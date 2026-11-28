import { describe, expect, mock, test } from 'bun:test'
import type { Q8Embedding, Q8Input } from './encoder-protocol'
import { searchSavedPassages } from './search'
import type { PassageIndex } from './search'
import { citationKey } from './thread-citations'

const id = { messageId: 'message', partId: 'citation' }
const another = { messageId: 'other', partId: 'citation' }
const vector: Q8Embedding = {
  vector: new Float32Array(256),
  identity: {
    model_id: 'model',
    checkpoint_digest: 'checkpoint',
    semantic_space_id: 'space',
    producer_revision: 'producer',
  },
}

function fixture(index: PassageIndex) {
  const encode = mock(async (_input: Q8Input, _signal: AbortSignal) => vector)
  const progress = mock(() => {})
  return {
    input: {
      text: ' climate ',
      citations: [id, another],
      index,
      encoder: { ready: false, encode },
      signal: new AbortController().signal,
      progress,
    },
    encode,
    progress,
  }
}

describe('searchSavedPassages', () => {
  test('queries first, indexes only missing inputs, and reuses RedCore on a new page', async () => {
    const indexed = new Map([[citationKey(another), 'version-one']])
    let digest = 'version-one'
    let text = 'The exact current passage'
    const index: PassageIndex = {
      prepare: async (citations) => ({
        authorized: citations.length,
        missing: citations
          .filter((citation) => {
            const expected = citation === id ? digest : 'version-one'
            return indexed.get(citationKey(citation)) !== expected
          })
          .map((citation) => ({
            ...citation,
            inputDigest: digest,
            text,
          })),
      }),
      publish: async (citation, embedding) => {
        expect(embedding).toBe(vector)
        expect(citation.inputDigest).toBe(digest)
        indexed.set(citationKey(citation), citation.inputDigest)
      },
      search: async (citations) =>
        citations
          .filter((citation) => indexed.has(citationKey(citation)))
          .map((citation) => ({ ...citation, score: 0.91 })),
    }
    const first = fixture(index)
    expect(await searchSavedPassages(first.input)).toEqual([
      { ...id, score: 0.91 },
      { ...another, score: 0.91 },
    ])
    expect(first.encode.mock.calls.map(([input]) => input)).toEqual([
      { input_kind: 'text', task: 'search_query', text: 'climate' },
      {
        input_kind: 'text',
        task: 'document',
        title: null,
        text: 'The exact current passage',
      },
    ])
    expect(first.progress).toHaveBeenCalledWith({ phase: 'starting' })

    const reload = fixture(index)
    expect(await searchSavedPassages(reload.input)).toHaveLength(2)
    expect(reload.encode).toHaveBeenCalledTimes(1)
    expect(reload.encode.mock.calls[0]?.[0].task).toBe('search_query')

    digest = 'version-two'
    text = 'Updated exact passage'
    const revised = fixture(index)
    expect(await searchSavedPassages(revised.input)).toHaveLength(2)
    expect(revised.encode).toHaveBeenCalledTimes(2)
    expect(revised.encode.mock.calls[1]?.[0]).toEqual({
      input_kind: 'text',
      task: 'document',
      title: null,
      text,
    })
  })

  test('does not start inference for passages the authority no longer serves', async () => {
    const never = mock(async (): Promise<never> => {
      throw new Error('Not reachable')
    })
    const { input, encode } = fixture({
      prepare: async () => ({ authorized: 0, missing: [] }),
      publish: never,
      search: never,
    })
    expect(await searchSavedPassages(input)).toEqual([])
    expect(encode).not.toHaveBeenCalled()
    expect(never).not.toHaveBeenCalled()
  })

  test('a missing native endpoint fails before any model is loaded', async () => {
    const unavailable = new Error('Saved-passage search is not served')
    const { input, encode } = fixture({
      prepare: async () => {
        throw unavailable
      },
      publish: async () => {},
      search: async () => [],
    })
    await expect(searchSavedPassages(input)).rejects.toBe(unavailable)
    expect(encode).not.toHaveBeenCalled()
  })

  test('a canceled query cannot publish an already encoded passage', async () => {
    const controller = new AbortController()
    const publish = mock(async () => {})
    const { input } = fixture({
      prepare: async () => ({
        authorized: 1,
        missing: [{ ...id, inputDigest: 'fresh', text: 'A passage' }],
      }),
      publish,
      search: async () => [],
    })
    await expect(
      searchSavedPassages({
        ...input,
        signal: controller.signal,
        encoder: {
          ready: true,
          encode: async (item) => {
            if (item.task === 'document') controller.abort()
            return vector
          },
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(publish).not.toHaveBeenCalled()
  })
})
