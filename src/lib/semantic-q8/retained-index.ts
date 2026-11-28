import { TheoremError } from '@theoremharness/sdk'
import { z } from 'zod'
import { mutate } from '../theorem/client'
import { readTheoremJson } from '../theorem/passthrough'
import { Q8Error } from './browser-encoder'
import type { Q8Identity } from './encoder-protocol'
import type { PassageIndex } from './search'
import { MAX_SEARCH_CITATIONS } from './thread-citations'

const citation = z.object({
  messageId: z.string().min(1),
  partId: z.string().min(1),
})
const prepared = z
  .object({
    authorized: z.number().int().min(0).max(MAX_SEARCH_CITATIONS),
    missing: z
      .array(
        citation.extend({
          inputDigest: z.string().min(1),
          text: z.string().min(1),
        }),
      )
      .max(MAX_SEARCH_CITATIONS),
  })
  .refine(({ authorized, missing }) => missing.length <= authorized, {
    message: 'Missing passages must be included in the authorized count',
  })
const publication = z.object({
  status: z.enum(['published', 'already_published']),
  inputDigest: z.string(),
  semanticSpaceId: z.string(),
  producerRevision: z.string(),
})
const ranked = z.object({
  matches: z
    .array(
      citation.extend({
        score: z.number().finite().min(-1).max(1),
      }),
    )
    .max(MAX_SEARCH_CITATIONS),
})

function wireIdentity(identity: Q8Identity) {
  // Match the representation profile of the pinned Q8 producer.
  return {
    semanticSpaceId: identity.semantic_space_id,
    checkpointDigest: identity.checkpoint_digest,
    producerRevision: identity.producer_revision,
    representationRevision: 'embeddinggemma2-shared-projection/1',
    modalities: 'text-image',
  }
}

/** Same-origin typed chat calls. No graph write, direct store URL or browser
 * credentials. The proxy binds the actual authenticated principal. */
export function retainedPassageIndex(
  threadId: string,
  signal: AbortSignal,
): PassageIndex {
  const base = `/api/chat/v1/threads/${encodeURIComponent(threadId)}/retained-semantic`
  const request = async (
    action: 'prepare' | 'publish' | 'search',
    payload: object,
    headers?: Record<string, string>,
  ) => {
    signal.throwIfAborted()
    const response = await fetch(`${base}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    })
    return readTheoremJson<unknown>(response)
  }

  return {
    async prepare(citations) {
      return prepared.parse(await request('prepare', { citations }))
    },
    async publish({ messageId, partId, inputDigest }, { identity, vector }) {
      signal.throwIfAborted()
      const receipt = publication.parse(
        await mutate((headers) =>
          request(
            'publish',
            {
              messageId,
              partId,
              inputDigest,
              identity: wireIdentity(identity),
              vector: Array.from(vector),
            },
            headers,
          ),
        ),
      )
      if (
        receipt.inputDigest !== inputDigest ||
        receipt.semanticSpaceId !== identity.semantic_space_id ||
        receipt.producerRevision !== identity.producer_revision
      )
        throw new Error('Unexpected passage publication receipt')
    },
    async search(citations, { identity, vector }) {
      const result = ranked.parse(
        await request('search', {
          citations,
          identity: wireIdentity(identity),
          queryVector: Array.from(vector),
        }),
      )
      return result.matches
    },
  }
}

export function savedPassageSearchError(error: unknown): string {
  if (error instanceof TheoremError) {
    switch (error.statusCode) {
      case 401:
        return 'Sign in again to search saved passages.'
      case 403:
        return 'This session can’t search the saved passages.'
      case 404:
      case 405:
        return 'Saved-passage search isn’t available from this Theorem server.'
      case 409:
      case 410:
        return 'A saved passage changed or is no longer available. Search again.'
    }
  }
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return 'The search took too long. Try again.'
  if (error instanceof Q8Error)
    return 'Couldn’t load or use Q8 on this device. Try again.'
  return 'Couldn’t search saved passages. Try again.'
}
