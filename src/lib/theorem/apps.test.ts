import { expect, test } from 'bun:test'
import { LoroDoc } from 'loro-crdt/base64'
import { TheoremError } from '@theoremharness/sdk'
import { fromBase64, toBase64 } from '../blocks/state'
import { AppDocument } from './apps'
import type { AppDocuments } from './apps'
import type { Theorem, mutate } from './client'
import {
  contentDigest,
  encodeNote,
  noteMarkdown,
  reviseNote,
} from './note-canonical'

async function fixture() {
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
          message: 'Document store unavailable',
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

test('editing an App persists the same document and survives a new view', async () => {
  const server = await fixture()
  const app = new AppDocument('app-document', server.api, server.change)
  const original = await app.load()
  await app.saveSource('<p>Editable categories</p>', original.revision)
  const reopened = await new AppDocument(
    'app-document',
    server.api,
    server.change,
  ).load()
  expect(reopened.documentId).toBe(original.documentId)
  expect(reopened.html).toBe('<p>Editable categories</p>')
  expect(reopened.revision.position).toBe(2)
  expect(server.saved().summary.documentKind).toBe('theorem.app')
  expect(server.writes[0]?.['If-Match']).toBe('1')
  await expect(
    app.saveSource('stale editor', original.revision),
  ).rejects.toThrow()
  expect(server.saved().markdownProjection).toBe('<p>Editable categories</p>')
})

test('App state merges into a newer source revision without replacing its HTML', async () => {
  const server = await fixture()
  const app = new AppDocument('app-document', server.api, server.change)
  const original = await app.load()
  const local = LoroDoc.fromSnapshot(original.canonical)
  const before = local.oplogVersion()
  local.getMap('app-state:categories').set('row-1', 'Editable')
  local.commit()
  const update = local.export({ mode: 'update', from: before })
  await server.remote('<p>New design</p>')
  await app.pushState(update)
  const saved = await app.load()
  expect(noteMarkdown(saved.canonical)).toBe('<p>New design</p>')
  expect(
    LoroDoc.fromSnapshot(saved.canonical)
      .getMap('app-state:categories')
      .get('row-1'),
  ).toBe('Editable')
  expect(saved.revision.position).toBe(3)
  const count = server.writes.length
  await app.flush()
  expect(server.writes).toHaveLength(count)
})

test('failed state saves report failure and retain the update for retry', async () => {
  const server = await fixture()
  const app = new AppDocument('app-document', server.api, server.change)
  const original = await app.load()
  const local = LoroDoc.fromSnapshot(original.canonical)
  const before = local.oplogVersion()
  local.getMap('app-state:rows').set('one', 'kept')
  local.commit()
  server.fail(true)
  await expect(
    app.pushState(local.export({ mode: 'update', from: before })),
  ).rejects.toThrow()
  expect(app.getSnapshot()?.saveError).toContain('unavailable')
  expect(server.saved().summary.revision.position).toBe(1)
  server.fail(false)
  await app.flush()
  const saved = await app.load()
  expect(saved.saveError).toBeUndefined()
  expect(
    LoroDoc.fromSnapshot(saved.canonical).getMap('app-state:rows').get('one'),
  ).toBe('kept')
})

test.each([
  ['foreign kind', { documentKind: 'authored' }],
  ['read-only App', { readOnly: true }],
  [
    'mismatched bytes',
    { revision: { position: 1, contentDigest: 'sha256:wrong' } },
  ],
])('App admission refuses %s', async (_name, summary) => {
  const server = await fixture()
  const original = server.api.get
  server.api.get = async (request) => {
    const snapshot = await original(request)
    return { ...snapshot, summary: { ...snapshot.summary, ...summary } }
  }
  await expect(
    new AppDocument('app-document', server.api, server.change).load(),
  ).rejects.toThrow()
  expect(server.writes).toHaveLength(0)
})

test('a source save requires both admitted position and digest', async () => {
  const server = await fixture()
  const app = new AppDocument('app-document', server.api, server.change)
  const original = await app.load()
  await expect(
    app.saveSource('wrong digest', {
      ...original.revision,
      contentDigest: 'sha256:other',
    }),
  ).rejects.toThrow()
  await expect(
    app.saveSource('wrong position', { ...original.revision, position: 2 }),
  ).rejects.toThrow()
  expect(server.writes).toHaveLength(0)
})

test('state retries revision conflicts with a bounded number of fresh reads', async () => {
  const server = await fixture()
  const app = new AppDocument('app-document', server.api, server.change)
  const original = await app.load()
  const local = LoroDoc.fromSnapshot(original.canonical)
  const before = local.oplogVersion()
  local.getMap('app-state:rows').set('one', 'kept')
  local.commit()
  let attempts = 0
  server.api.revise = async () => {
    attempts++
    throw new TheoremError({ statusCode: 412, message: 'Revision conflict' })
  }
  await expect(
    app.pushState(local.export({ mode: 'update', from: before })),
  ).rejects.toThrow()
  expect(attempts).toBe(3)
  expect(server.saved().summary.revision.position).toBe(1)
})
