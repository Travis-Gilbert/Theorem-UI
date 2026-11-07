import { TheoremError } from '@theoremharness/sdk'
import { fromBase64, toBase64 } from '../../src/lib/blocks/state'
import type { AppDocuments } from '../../src/lib/theorem/apps'
import type { Theorem, mutate } from '../../src/lib/theorem/client'
import {
  contentDigest,
  encodeNote,
  reviseNote,
} from '../../src/lib/theorem/note-canonical'

export async function appDocumentFixture() {
  const canonical = encodeNote('<p>Original</p>')
  const digest = await contentDigest(canonical)
  let saved: Theorem.DocumentSnapshot = {
    schema: 'theorem-document/2',
    summary: {
      schema: 'theorem-document/2',
      documentId: 'app-document',
      documentKind: 'theorem.app',
      title: 'Comparison',
      revision: { position: 1, contentDigest: digest },
      readOnly: false,
      createdPosition: 1,
      updatedPosition: 1,
      actors: [],
      collectionIds: [],
      origin: {
        kind: 'user_authored',
        actorId: 'builder',
        originSurface: 'conversation',
      },
      projectionDigest: digest,
    },
    canonical: {
      placement: 'inline',
      bytesBase64: toBase64(canonical),
      size: canonical.length,
      digest,
    },
    markdownProjection: '<p>Original</p>',
  }
  let fail = false
  const writes: Theorem.ReviseDocumentRequest[] = []
  const api: AppDocuments = {
    async get() {
      return structuredClone(saved)
    },
    async snapshot() {
      return structuredClone(saved)
    },
    async revise(request) {
      if (fail)
        throw new TheoremError({
          statusCode: 503,
          body: { detail: 'Document store unavailable' },
        })
      if (
        String(request.expectedRevision.position) !==
        String(saved.summary.revision.position)
      )
        throw new TheoremError({
          statusCode: 412,
          message: 'Revision conflict',
        })
      writes.push(request)
      const previousRevision = saved.summary.revision
      saved = {
        ...saved,
        canonical: request.body.canonical,
        markdownProjection: request.body.markdownProjection,
        summary: {
          ...saved.summary,
          documentKind: request.body.documentKind,
          revision: {
            position: Number(previousRevision.position) + 1,
            contentDigest: request.body.canonical.digest,
          },
        },
      }
      return {
        schema: 'theorem-document/2',
        idempotencyKey: request.idempotencyKey,
        document: saved.summary,
        previousRevision,
        memoryProjection: {
          memoryDocId: 'projection',
          derivationRef: 'document',
          contentAddress: 'content',
          projectionDigest: 'digest',
        },
      }
    },
  }
  const change: typeof mutate = async (run) =>
    run({ 'X-CSRF-Token': 'test-csrf', 'Idempotency-Key': crypto.randomUUID() })
  return {
    api,
    change,
    writes,
    saved: () => saved,
    fail: (value: boolean) => {
      fail = value
    },
    async remote(html: string) {
      if (saved.canonical.placement !== 'inline')
        throw new Error('fixture must be inline')
      const bytes = reviseNote(fromBase64(saved.canonical.bytesBase64), html)
      const digest = await contentDigest(bytes)
      saved = {
        ...saved,
        markdownProjection: html,
        canonical: {
          placement: 'inline',
          bytesBase64: toBase64(bytes),
          digest,
          size: bytes.length,
        },
        summary: {
          ...saved.summary,
          revision: {
            position: Number(saved.summary.revision.position) + 1,
            contentDigest: digest,
          },
        },
      }
    },
  }
}
