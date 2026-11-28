import { collectCitationSources } from '../theorem/citations'
import type { CitationSource } from '../theorem/citations'
import type { Theorem } from '../theorem/client'

export type CitationId = { messageId: string; partId: string }
export type SearchableCitation = CitationId & {
  source: CitationSource
}

export const citationKey = ({ messageId, partId }: CitationId) =>
  JSON.stringify([messageId, partId])

export const MAX_SEARCH_CITATIONS = 24
const MAX_MESSAGES = 100

/** Canonical chat history gives part IDs, not authorization or index input.
 * Only the exact-passage authority may supply text for indexing. */
export function threadCitations(
  messages: readonly Theorem.Message[],
): SearchableCitation[] {
  const citations = new Map<string, SearchableCitation>()
  for (
    let index = messages.length - 1;
    index >= Math.max(0, messages.length - MAX_MESSAGES);
    index--
  ) {
    const message = messages[index]
    if (message?.role !== 'assistant') continue
    const { messageId } = message
    for (const part of message.parts) {
      if (part.type !== 'citation' || !part.partId) continue
      // Presentation groups repeated evidence. Search names the individual
      // versioned part, even when two parts share a display source ID or quote.
      const [source] = collectCitationSources([
        {
          type: 'data',
          name: 'theorem-citation',
          id: part.partId,
          data: part.payload,
        },
      ])
      if (!source?.capture || !source.passages[0]?.span) continue
      const entry = { messageId, partId: part.partId, source }
      citations.set(citationKey(entry), entry)
      if (citations.size === MAX_SEARCH_CITATIONS)
        return [...citations.values()]
    }
  }
  return [...citations.values()]
}
