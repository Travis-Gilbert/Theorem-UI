// SOURCING: theoremJson (the SDK passthrough; the vendored SDK has no client for Theorem's document collections and filings yet), @tanstack/react-query (the folders and the moves between them), the Documents v2 client for a note's current revision
//
// Notes mode's folders are Theorem's document collections. Theorem keeps each
// document in one collection at most: filing places it, and a correction to the
// latest filing moves it. The collection Theorem makes when it files into
// nothing, named HOME_COLLECTION, is the top level, so a note in it, or in no
// collection, sits loose beside the folders.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mutate, theorem } from './client'
import type { MutationHeaders, Theorem } from './client'
import type { NoteEntry } from './note-library'
import { theoremJson } from './passthrough'

const SCHEMA = 'theorem-document/2'
const COLLECTIONS = '/api/documents/v2/collections'

/** The name Theorem gives the collection it files into when there is none. */
export const HOME_COLLECTION = 'Notes'

export type Collection = {
  collectionId: string
  name: string
  kind: 'manual' | 'auto'
  documentIds: string[]
}

type CollectionPage = { collections: Collection[] }

type FilingReceipt = { receiptId: string; destinationCollectionId: string }

export type NoteFolder = Pick<Collection, 'collectionId' | 'name'>

export type NoteFolders = {
  folders: NoteFolder[]
  /** The top level's collection, once Theorem has made it. */
  homeId?: string
  /** The folder each note is in; a loose note has none. */
  folderOf: ReadonlyMap<string, string>
}

const isHome = (collection: Collection) =>
  collection.kind === 'auto' && collection.name === HOME_COLLECTION

/** Theorem's collections as folders, in the order Theorem lists them (by name). */
export function noteFolders(collections: Collection[]): NoteFolders {
  const home = collections.find(isHome)
  const kept = collections.filter((collection) => collection !== home)
  return {
    folders: kept.map(({ collectionId, name }) => ({ collectionId, name })),
    homeId: home?.collectionId,
    folderOf: new Map(
      kept.flatMap((collection) =>
        collection.documentIds.map(
          (id) => [id, collection.collectionId] as const,
        ),
      ),
    ),
  }
}

/** The loose notes, and the notes of each folder, by the document each row opens. */
export function placeNotes<T extends NoteEntry>(
  entries: T[],
  folderOf: ReadonlyMap<string, string>,
) {
  return {
    loose: entries.filter((entry) => !folderOf.has(entry.opens)),
    inFolder: (collectionId: string) =>
      entries.filter((entry) => folderOf.get(entry.opens) === collectionId),
  }
}

/**
 * The name a new folder gets. Theorem reuses a collection that already has the
 * name asked for, so a taken name, or the top level's, gets the next number.
 */
export function folderName(wanted: string, taken: string[]): string {
  const base = wanted.trim() || 'Untitled folder'
  const used = new Set(
    [...taken, HOME_COLLECTION].map((name) => name.toLowerCase()),
  )
  if (!used.has(base.toLowerCase())) return base
  let n = 2
  while (used.has(`${base} ${n}`.toLowerCase())) n += 1
  return `${base} ${n}`
}

export function folderRequest(
  name: string,
  kind: Collection['kind'],
  headers: MutationHeaders,
) {
  return {
    path: COLLECTIONS,
    init: {
      method: 'POST',
      headers,
      body: {
        schema: SCHEMA,
        idempotencyKey: headers['Idempotency-Key'],
        name,
        kind,
      },
    },
  }
}

/** File a note, at the revision the person saw; a filed note answers with its latest filing. */
export function fileRequest(
  summary: Pick<Theorem.DocumentSummary, 'documentId' | 'revision'>,
  headers: MutationHeaders,
) {
  return {
    path: `/api/documents/v2/documents/${encodeURIComponent(summary.documentId)}/filings`,
    init: {
      method: 'POST',
      headers: { ...headers, 'If-Match': String(summary.revision.position) },
      body: {
        schema: SCHEMA,
        idempotencyKey: headers['Idempotency-Key'],
        documentId: summary.documentId,
        expectedRevision: summary.revision,
      },
    },
  }
}

/** Move a filed note: correct its latest filing to another collection. */
export function correctionRequest(
  receiptId: string,
  destinationCollectionId: string,
  headers: MutationHeaders,
) {
  return {
    path: `/api/documents/v2/filings/${encodeURIComponent(receiptId)}/corrections`,
    init: {
      method: 'POST',
      headers,
      body: {
        schema: SCHEMA,
        idempotencyKey: headers['Idempotency-Key'],
        receiptId,
        destinationCollectionId,
      },
    },
  }
}

export const noteFoldersKey = ['theorem', 'notes', 'folders'] as const

const listCollections = () =>
  theoremJson<CollectionPage>(`${COLLECTIONS}?schema=${SCHEMA}`)

const createCollection = (name: string, kind: Collection['kind']) =>
  mutate((headers) => {
    const { path, init } = folderRequest(name, kind, headers)
    return theoremJson<Collection>(path, init)
  })

export function useNoteFolders() {
  return useQuery({
    queryKey: noteFoldersKey,
    queryFn: listCollections,
    select: (page) => noteFolders(page.collections),
    staleTime: 10_000,
  })
}

/** Make a folder; `name` is already free (see folderName). */
export function useNewFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createCollection(name, 'manual'),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: noteFoldersKey }),
  })
}

/** The top level's collection, made the way Theorem would make it if it is not there yet. */
async function homeCollection(): Promise<string> {
  const { homeId } = noteFolders((await listCollections()).collections)
  return (
    homeId ?? (await createCollection(HOME_COLLECTION, 'auto')).collectionId
  )
}

async function moveNote(documentId: string, to: string | null) {
  const destination = to ?? (await homeCollection())
  const { summary } = await theorem().documents.get({
    documentId,
    schema: SCHEMA,
  })
  const receipt = await mutate((headers) => {
    const { path, init } = fileRequest(summary, headers)
    return theoremJson<FilingReceipt>(path, init)
  })
  if (receipt.destinationCollectionId === destination) return
  await mutate((headers) => {
    const { path, init } = correctionRequest(
      receipt.receiptId,
      destination,
      headers,
    )
    return theoremJson<unknown>(path, init)
  })
}

/** The page with one note moved, so the row lands before Theorem answers. */
const moved = (
  page: CollectionPage,
  documentId: string,
  to: string | null,
): CollectionPage => ({
  ...page,
  collections: page.collections.map((collection) => {
    const documentIds = collection.documentIds.filter((id) => id !== documentId)
    return {
      ...collection,
      documentIds:
        collection.collectionId === to
          ? [...documentIds, documentId]
          : documentIds,
    }
  }),
})

/** Move a note into a folder, or to the top level with `to: null`. */
export function useMoveNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      documentId,
      to,
    }: {
      documentId: string
      to: string | null
    }) => moveNote(documentId, to),
    onMutate: async ({ documentId, to }) => {
      await queryClient.cancelQueries({ queryKey: noteFoldersKey })
      const before = queryClient.getQueryData<CollectionPage>(noteFoldersKey)
      if (before)
        queryClient.setQueryData(noteFoldersKey, moved(before, documentId, to))
      return { before }
    },
    onError: (_error, _move, context) => {
      if (context?.before)
        queryClient.setQueryData(noteFoldersKey, context.before)
    },
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: noteFoldersKey }),
  })
}
