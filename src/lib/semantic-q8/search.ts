import type { Q8Embedding, Q8Input } from './encoder-protocol'
import { citationKey } from './thread-citations'
import type { CitationId } from './thread-citations'

export type IndexInput = CitationId & {
  inputDigest: string
  text: string
}

export type PassageMatch = CitationId & { score: number }

export type PassageIndex = {
  prepare: (
    citations: CitationId[],
  ) => Promise<{ authorized: number; missing: IndexInput[] }>
  publish: (citation: IndexInput, embedding: Q8Embedding) => Promise<void>
  search: (
    citations: CitationId[],
    embedding: Q8Embedding,
  ) => Promise<PassageMatch[]>
}

export type SearchProgress =
  | { phase: 'checking' }
  | { phase: 'starting' }
  | { phase: 'indexing'; done: number; total: number }
  | { phase: 'ranking' }

type Encoder = {
  readonly ready: boolean
  encode: (input: Q8Input, signal: AbortSignal) => Promise<Q8Embedding>
}

/** The browser keeps at most a query and one document vector for this
 * operation. RedCore decides which inputs need inference and ranks the
 * authorized matches using vectors it has persisted. */
export async function searchSavedPassages({
  text,
  citations,
  encoder,
  index,
  signal,
  progress,
}: {
  text: string
  citations: CitationId[]
  encoder: Encoder
  index: PassageIndex
  signal: AbortSignal
  progress: (value: SearchProgress) => void
}): Promise<PassageMatch[]> {
  signal.throwIfAborted()
  if (!text.trim() || citations.length === 0) return []
  const { authorized, missing } = await index.prepare(citations)
  signal.throwIfAborted()
  if (!authorized) return []
  if (!encoder.ready) progress({ phase: 'starting' })
  const query = await encoder.encode(
    { input_kind: 'text', task: 'search_query', text: text.trim() },
    signal,
  )
  const allowed = new Set(citations.map(citationKey))
  const unique = new Set<string>()
  for (const citation of missing) {
    signal.throwIfAborted()
    const key = citationKey(citation)
    if (!allowed.has(key) || unique.has(key))
      throw new Error('Unexpected passage indexing input')
    unique.add(key)
    progress({
      phase: 'indexing',
      done: unique.size - 1,
      total: missing.length,
    })
    const vector = await encoder.encode(
      {
        input_kind: 'text',
        task: 'document',
        title: null,
        text: citation.text,
      },
      signal,
    )
    signal.throwIfAborted()
    await index.publish(citation, vector)
  }
  signal.throwIfAborted()
  progress({ phase: 'ranking' })
  const ranked = await index.search(citations, query)
  signal.throwIfAborted()
  return ranked.filter((match) => allowed.has(citationKey(match)))
}
