import { expect, test } from 'bun:test'
import { LoroDoc } from 'loro-crdt/base64'
import { TheoremError } from '@theoremharness/sdk'
import { AppDocument } from './apps'
import { noteMarkdown } from './note-canonical'
import { appDocumentFixture as fixture } from '../../../test/blocks/app-documents'

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

test('App saves show the public problem detail and reference instead of the SDK JSON dump', async () => {
  const store = await fixture()
  const app = new AppDocument('app-document', store.api, store.change)
  const original = await app.load()
  store.api.revise = async () => {
    throw new TheoremError({
      statusCode: 412,
      body: {
        code: 'document_revision_conflict',
        title: 'App changed',
        detail: 'This App was updated elsewhere. Reload before saving.',
        correlationId: 'app-save-reference',
      },
    })
  }
  await app.saveSource('new source', original.revision).catch(() => {})
  expect(app.getSnapshot()?.saveError).toBe(
    'This App was updated elsewhere. Reload before saving. Reference: app-save-reference',
  )
  expect(app.getSnapshot()?.saveError).not.toContain('Status code:')
})
