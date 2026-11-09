import { describe, expect, test } from 'bun:test'
import type { NoteEntry } from './note-library'
import {
  HOME_COLLECTION,
  canNest,
  correctionRequest,
  deleteRequest,
  fileRequest,
  folderName,
  folderRequest,
  noteFolders,
  placeNotes,
  subfolders,
  updateRequest,
} from './note-folders'
import type { Collection } from './note-folders'

const collection = (overrides: Partial<Collection> = {}): Collection => ({
  collectionId: 'coll:1',
  name: 'Recipes',
  kind: 'manual',
  documentIds: [],
  ...overrides,
})

const entry = (documentId: string): NoteEntry => ({
  documentId,
  title: documentId,
  source: 'authored',
  retired: false,
  opens: documentId,
})

const headers = { 'X-CSRF-Token': 'csrf', 'Idempotency-Key': 'key-1' }

describe('noteFolders', () => {
  test("every collection the person made is a folder, in Theorem's order", () => {
    const { folders } = noteFolders([
      collection({ collectionId: 'coll:a', name: 'Garden' }),
      collection({ collectionId: 'coll:b', name: 'Recipes' }),
    ])
    expect(folders.map((folder) => folder.name)).toEqual(['Garden', 'Recipes'])
  })

  test("Theorem's default collection is the top level, not a folder", () => {
    const { folders, homeId } = noteFolders([
      collection({
        collectionId: 'coll:home',
        name: HOME_COLLECTION,
        kind: 'auto',
      }),
      collection({ collectionId: 'coll:a', name: 'Garden' }),
    ])
    expect(homeId).toBe('coll:home')
    expect(folders.map((folder) => folder.collectionId)).toEqual(['coll:a'])
  })

  test('a folder the person named like the default stays a folder', () => {
    const { folders, homeId } = noteFolders([
      collection({
        collectionId: 'coll:a',
        name: HOME_COLLECTION,
        kind: 'manual',
      }),
    ])
    expect(homeId).toBeUndefined()
    expect(folders).toHaveLength(1)
  })

  test('says which folder holds each note', () => {
    const { folderOf } = noteFolders([
      collection({
        collectionId: 'coll:home',
        name: HOME_COLLECTION,
        kind: 'auto',
        documentIds: ['doc:1'],
      }),
      collection({ collectionId: 'coll:a', documentIds: ['doc:2'] }),
    ])
    expect(folderOf.get('doc:2')).toBe('coll:a')
    expect(folderOf.has('doc:1')).toBe(false)
  })
})

describe('placeNotes', () => {
  test('a note in a folder shows there and nowhere else', () => {
    const folderOf = new Map([['doc:2', 'coll:a']])
    const { loose, inFolder } = placeNotes(
      [entry('doc:1'), entry('doc:2'), entry('doc:3')],
      folderOf,
    )
    expect(loose.map((note) => note.documentId)).toEqual(['doc:1', 'doc:3'])
    expect(inFolder('coll:a').map((note) => note.documentId)).toEqual(['doc:2'])
    expect(inFolder('coll:b')).toEqual([])
  })

  test('an agent note made editable is placed by the copy it opens', () => {
    const copied = {
      ...entry('mem:1'),
      source: 'encoded' as const,
      opens: 'doc:9',
    }
    const { inFolder } = placeNotes([copied], new Map([['doc:9', 'coll:a']]))
    expect(inFolder('coll:a')).toEqual([copied])
  })
})

describe('folderName', () => {
  test('keeps what the person typed, trimmed', () => {
    expect(folderName('  Garden ', [])).toBe('Garden')
  })

  test('an empty name becomes an untitled folder', () => {
    expect(folderName('   ', [])).toBe('Untitled folder')
  })

  test('a taken name gets a number, since Theorem would reuse that folder', () => {
    expect(folderName('Garden', ['garden'])).toBe('Garden 2')
    expect(folderName('Garden', ['Garden', 'Garden 2'])).toBe('Garden 3')
  })

  test("the default collection's name is taken even before it exists", () => {
    expect(folderName(HOME_COLLECTION, [])).toBe(`${HOME_COLLECTION} 2`)
  })
})

describe('requests', () => {
  test('a new folder is a manual collection', () => {
    expect(folderRequest('Garden', 'manual', headers)).toEqual({
      path: '/api/documents/v2/collections',
      init: {
        method: 'POST',
        headers,
        body: {
          schema: 'theorem-document/2',
          idempotencyKey: 'key-1',
          name: 'Garden',
          kind: 'manual',
        },
      },
    })
  })

  test('filing names the revision the person saw', () => {
    const summary = {
      documentId: 'note:1',
      revision: { position: 12, contentDigest: 'sha256:c' },
    }
    expect(fileRequest(summary, headers)).toEqual({
      path: '/api/documents/v2/documents/note%3A1/filings',
      init: {
        method: 'POST',
        headers: { ...headers, 'If-Match': '12' },
        body: {
          schema: 'theorem-document/2',
          idempotencyKey: 'key-1',
          documentId: 'note:1',
          expectedRevision: summary.revision,
        },
      },
    })
  })

  test('a move corrects the latest filing to the folder', () => {
    expect(correctionRequest('receipt:1', 'coll:a', headers)).toEqual({
      path: '/api/documents/v2/filings/receipt%3A1/corrections',
      init: {
        method: 'POST',
        headers,
        body: {
          schema: 'theorem-document/2',
          idempotencyKey: 'key-1',
          receiptId: 'receipt:1',
          destinationCollectionId: 'coll:a',
        },
      },
    })
  })
})

describe('nested folders', () => {
  const trips = collection({ collectionId: 'coll:trips', name: 'Trips' })
  const rome = collection({
    collectionId: 'coll:rome',
    name: 'Rome',
    parentId: 'coll:trips',
  })
  const food = collection({
    collectionId: 'coll:food',
    name: 'Food',
    parentId: 'coll:rome',
  })
  const { folders } = noteFolders([food, rome, trips])

  test('a folder keeps the folder it sits in', () => {
    expect(folders.find((f) => f.collectionId === 'coll:rome')?.parentId).toBe(
      'coll:trips',
    )
  })

  test('a folder whose parent is not listed sits at the top level', () => {
    const { folders: orphaned } = noteFolders([rome])
    expect(orphaned[0]?.parentId).toBeNull()
  })

  test('a folder from a Theorem that does not nest sits at the top level', () => {
    const { parentId: _, ...flat } = trips
    expect(noteFolders([flat as Collection]).folders[0]?.parentId).toBeNull()
  })

  test('subfolders lists the folders inside one, or the top level', () => {
    expect(subfolders(folders, null).map((f) => f.name)).toEqual(['Trips'])
    expect(subfolders(folders, 'coll:trips').map((f) => f.name)).toEqual([
      'Rome',
    ])
  })

  test('a folder cannot go inside itself or anything inside it', () => {
    expect(canNest(folders, 'coll:trips', 'coll:trips')).toBe(false)
    expect(canNest(folders, 'coll:trips', 'coll:food')).toBe(false)
    expect(canNest(folders, 'coll:food', 'coll:trips')).toBe(true)
    expect(canNest(folders, 'coll:food', null)).toBe(true)
  })

  test('a folder already there is not moved there again', () => {
    expect(canNest(folders, 'coll:rome', 'coll:trips')).toBe(false)
    expect(canNest(folders, 'coll:trips', null)).toBe(false)
  })
})

describe('folder edits', () => {
  test('a new folder inside another names its parent', () => {
    expect(
      folderRequest('Rome', 'manual', headers, 'coll:trips').init.body,
    ).toEqual({
      schema: 'theorem-document/2',
      idempotencyKey: 'key-1',
      name: 'Rome',
      kind: 'manual',
      parentId: 'coll:trips',
    })
  })

  test('a rename sends only the name', () => {
    expect(updateRequest('coll:1', { name: 'Garden' }, headers)).toEqual({
      path: '/api/documents/v2/collections/coll%3A1',
      init: {
        method: 'PATCH',
        headers,
        body: {
          schema: 'theorem-document/2',
          idempotencyKey: 'key-1',
          name: 'Garden',
        },
      },
    })
  })

  test('a move to the top level sends a null parent', () => {
    expect(
      updateRequest('coll:1', { parentId: null }, headers).init.body,
    ).toEqual({
      schema: 'theorem-document/2',
      idempotencyKey: 'key-1',
      parentId: null,
    })
  })

  test('a delete has no body', () => {
    expect(deleteRequest('coll:1', headers)).toEqual({
      path: '/api/documents/v2/collections/coll%3A1',
      init: { method: 'DELETE', headers },
    })
  })
})
