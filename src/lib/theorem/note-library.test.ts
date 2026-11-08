import { describe, expect, test } from 'bun:test'
import type { Theorem } from './client'
import {
  lifecycleRequest,
  nextPageParams,
  noteEntry,
  noteMark,
  onShelf,
  shelfRequest,
  summaryFacts,
} from './note-library'

const summary = (
  overrides: Partial<Theorem.DocumentSummary> & { retired?: boolean } = {},
): Theorem.DocumentSummary =>
  ({
    actors: [],
    collectionIds: [],
    createdPosition: 1,
    documentId: 'doc:1',
    documentKind: 'authored',
    origin: { kind: 'user_authored' },
    projectionDigest: 'sha256:p',
    readOnly: false,
    revision: { position: 7, contentDigest: 'sha256:c' },
    schema: 'theorem-document/2',
    title: 'Groceries',
    updatedPosition: 9,
    ...overrides,
  }) as Theorem.DocumentSummary

const facts = (overrides: Parameters<typeof summary>[0] = {}) =>
  summaryFacts(summary(overrides))

const encoded = (promotedDocumentId?: string) =>
  ({
    kind: 'agent_encoded',
    sourceMemoryDocId: 'mem:4',
    actorId: 'agent:front',
    originSurface: 'chat',
    derivationRef: 'drv:1',
    contentAddress: 'sha256:m',
    sourceReadOnly: true,
    promotedDocumentId,
  }) as Theorem.DocumentOrigin

describe('noteEntry', () => {
  test('a note a person wrote opens itself and can be trashed', () => {
    expect(noteEntry(facts())).toEqual({
      documentId: 'doc:1',
      title: 'Groceries',
      source: 'authored',
      retired: false,
      opens: 'doc:1',
    })
  })

  test('an untitled document reads as an untitled note', () => {
    expect(noteEntry(facts({ title: '  ' })).title).toBe('Untitled note')
  })

  test('a document an agent encoded can be made editable from its memory', () => {
    expect(noteEntry(facts({ origin: encoded() }))).toEqual({
      documentId: 'doc:1',
      title: 'Groceries',
      source: 'encoded',
      retired: false,
      opens: 'doc:1',
      promotion: { memoryDocId: 'mem:4', contentAddress: 'sha256:m' },
    })
  })

  test('an encoded document already made editable opens the editable copy', () => {
    const entry = noteEntry(facts({ origin: encoded('doc:9') }))
    expect(entry.opens).toBe('doc:9')
    expect(entry.promotion).toBeUndefined()
  })

  test('reads the retired flag Theorem reports, and absent means live', () => {
    expect(noteEntry(facts({ retired: true })).retired).toBe(true)
    expect(noteEntry(facts()).retired).toBe(false)
  })
})

describe('nextPageParams', () => {
  test('continues after the cursor Theorem returned', () => {
    expect(
      nextPageParams({
        schema: 'theorem-document/2',
        documents: [],
        nextCursor: { afterUpdatedPosition: 3, afterDocumentId: 'doc:2' },
      }),
    ).toEqual({ afterUpdatedPosition: 3, afterDocumentId: 'doc:2' })
  })

  test('stops when there is no cursor', () => {
    expect(
      nextPageParams({ schema: 'theorem-document/2', documents: [] }),
    ).toBeUndefined()
  })
})

describe('lifecycleRequest', () => {
  const headers = { 'X-CSRF-Token': 'csrf', 'Idempotency-Key': 'key-1' }

  test('retires at the revision the person saw', () => {
    expect(
      lifecycleRequest('retire', summary({ documentId: 'doc:a/b' }), headers),
    ).toEqual({
      path: '/api/documents/v2/documents/doc%3Aa%2Fb/retirements',
      init: {
        method: 'POST',
        headers: {
          'X-CSRF-Token': 'csrf',
          'Idempotency-Key': 'key-1',
          'If-Match': '7',
        },
        body: {
          schema: 'theorem-document/2',
          idempotencyKey: 'key-1',
          documentId: 'doc:a/b',
          expectedRevision: { position: 7, contentDigest: 'sha256:c' },
        },
      },
    })
  })

  test('restores through the restorations route', () => {
    expect(lifecycleRequest('restore', summary(), headers).path).toBe(
      '/api/documents/v2/documents/doc%3A1/restorations',
    )
  })
})

describe('shelves', () => {
  test("the person's notes leave out what agents wrote", () => {
    expect(shelfRequest('notes')).toEqual({ includeAgentEncoded: false })
  })

  test('the Agent notes folder asks Theorem for agent memory alone', () => {
    expect(shelfRequest('agent')).toEqual({
      includeAgentEncoded: true,
      queryParams: { origin: 'agent_encoded' },
    })
  })

  test('the Trash asks for retired documents', () => {
    expect(shelfRequest('trash')).toEqual({
      includeAgentEncoded: false,
      queryParams: { retired: 'only' },
    })
  })

  test('each shelf keeps only its own rows, whatever a server sends', () => {
    const mine = noteEntry(facts())
    const agents = noteEntry(facts({ origin: encoded() }))
    const trashed = noteEntry(facts({ retired: true }))
    const rows = [mine, agents, trashed]
    expect(rows.filter((row) => onShelf(row, 'notes'))).toEqual([mine])
    expect(rows.filter((row) => onShelf(row, 'agent'))).toEqual([agents])
    expect(rows.filter((row) => onShelf(row, 'trash'))).toEqual([trashed])
  })
})

describe('noteMark', () => {
  const written = noteEntry(facts())

  test('a saved note reads as a written page', () => {
    expect(noteMark(written)).toBe('written')
    expect(noteMark(written, 'saved')).toBe('written')
  })

  test('a note with changes on their way is being written', () => {
    expect(noteMark(written, 'pending')).toBe('editing')
    expect(noteMark(written, 'saving')).toBe('editing')
  })

  test('a note Theorem refused to save is marked unsaved', () => {
    expect(noteMark(written, 'conflict')).toBe('unsaved')
    expect(noteMark(written, 'error')).toBe('unsaved')
  })

  test("an agent's note is the agent's until it is copied", () => {
    expect(noteMark(noteEntry(facts({ origin: encoded() })))).toBe('agent')
    expect(noteMark(noteEntry(facts({ origin: encoded('doc:copy') })))).toBe(
      'copied',
    )
  })
})
