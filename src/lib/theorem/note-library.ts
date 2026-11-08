// SOURCING: @theoremharness/sdk documents client (Theorem Documents v2: list, promote), theoremJson (the SDK passthrough, for retire and restore until the SDK is regenerated with them), @tanstack/react-query (the library's pages and its mutations)
//
// Notes mode's library: every Theorem document the person can open, the ones
// an agent encoded among them, and the Trash. One note's text and its saves
// live in notes.ts; this file only lists, removes, restores and promotes.
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { mutate, theorem } from './client'
import type { MutationHeaders, Theorem } from './client'
import {
  createNote,
  isRetired,
  noteKey,
  noteLibraryKey,
  primeNote,
} from './notes'
import type { SaveStatus } from './notes'
import { theoremJson } from './passthrough'

const SCHEMA = 'theorem-document/2'
const PAGE_SIZE = 50

export type NoteEntry = {
  documentId: string
  title: string
  /** Written by a person, or encoded by an agent from its memory. */
  source: 'authored' | 'encoded'
  retired: boolean
  /** The document the row opens: an encoded note already made editable opens its copy. */
  opens: string
  /** Present while an encoded note can still be made editable. */
  promotion?: { memoryDocId: string; contentAddress: string }
}

/** What a row needs, from a listed summary or an open note. */
export type NoteFacts = Pick<
  Theorem.DocumentSummary,
  'documentId' | 'title' | 'origin'
> & { retired: boolean }

export const summaryFacts = (summary: Theorem.DocumentSummary): NoteFacts => ({
  ...summary,
  retired: isRetired(summary),
})

export function noteEntry(facts: NoteFacts): NoteEntry {
  const { origin } = facts
  const base = {
    documentId: facts.documentId,
    title: facts.title.trim() || 'Untitled note',
    retired: facts.retired,
  }
  if (origin.kind !== 'agent_encoded')
    return { ...base, source: 'authored', opens: facts.documentId }
  return origin.promotedDocumentId
    ? { ...base, source: 'encoded', opens: origin.promotedDocumentId }
    : {
        ...base,
        source: 'encoded',
        opens: facts.documentId,
        promotion: {
          memoryDocId: origin.sourceMemoryDocId,
          contentAddress: origin.contentAddress,
        },
      }
}

/**
 * What a row's icon says about its note: written and saved, being written,
 * refused by Theorem, an agent's own, or an agent's made editable as a copy.
 */
export type NoteMark = 'written' | 'editing' | 'unsaved' | 'agent' | 'copied'

export function noteMark(entry: NoteEntry, status?: SaveStatus): NoteMark {
  if (entry.source === 'encoded') return entry.promotion ? 'agent' : 'copied'
  if (status === 'pending' || status === 'saving') return 'editing'
  if (status === 'conflict' || status === 'error') return 'unsaved'
  return 'written'
}

export const nextPageParams = (page: Theorem.DocumentPage) =>
  page.nextCursor && {
    afterUpdatedPosition: page.nextCursor.afterUpdatedPosition,
    afterDocumentId: page.nextCursor.afterDocumentId,
  }

export type Lifecycle = 'retire' | 'restore'

const LIFECYCLE_ROUTE = { retire: 'retirements', restore: 'restorations' }

/** The request that moves a document to the Trash or back, at the revision the person saw. */
export function lifecycleRequest(
  action: Lifecycle,
  summary: Pick<Theorem.DocumentSummary, 'documentId' | 'revision'>,
  headers: MutationHeaders,
) {
  return {
    path: `/api/documents/v2/documents/${encodeURIComponent(summary.documentId)}/${LIFECYCLE_ROUTE[action]}`,
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

/** Refetch every list of notes: a save can rename one, a removal moves it. */
export const refreshLibrary = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: noteLibraryKey })

/**
 * Where a note is kept: the person's own notes, the Agent notes folder of what
 * agents wrote to their memory, or the Trash.
 */
export type NoteShelf = 'notes' | 'agent' | 'trash'

/** What Theorem is asked for to fill a shelf. */
export function shelfRequest(shelf: NoteShelf): {
  includeAgentEncoded: boolean
  queryParams?: Record<string, string>
} {
  if (shelf === 'agent')
    return {
      includeAgentEncoded: true,
      queryParams: { origin: 'agent_encoded' },
    }
  if (shelf === 'trash')
    return { includeAgentEncoded: false, queryParams: { retired: 'only' } }
  return { includeAgentEncoded: false }
}

/** Whether a row belongs on a shelf, so a server that ignores a filter cannot mix them. */
export const onShelf = (entry: NoteEntry, shelf: NoteShelf) =>
  shelf === 'trash'
    ? entry.retired
    : !entry.retired && (entry.source === 'encoded') === (shelf === 'agent')

/** A shelf's notes, newest first; `query` searches titles and text. */
export function useNoteLibrary(query: string, shelf: NoteShelf) {
  const search = query.trim() || undefined
  const { includeAgentEncoded, queryParams } = shelfRequest(shelf)
  return useInfiniteQuery({
    queryKey: [...noteLibraryKey, shelf, search],
    initialPageParam: undefined as ReturnType<typeof nextPageParams>,
    queryFn: ({ pageParam }) =>
      theorem().documents.list(
        {
          schema: SCHEMA,
          limit: PAGE_SIZE,
          includeAgentEncoded,
          query: search,
          ...pageParam,
        },
        queryParams ? { queryParams } : undefined,
      ),
    getNextPageParam: nextPageParams,
    select: (data) =>
      data.pages
        .flatMap((page) => page.documents)
        .map((summary) => noteEntry(summaryFacts(summary)))
        .filter((entry) => onShelf(entry, shelf)),
    staleTime: 10_000,
  })
}

export function useNewNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => createNote(''),
    onSuccess: (note) => {
      primeNote(queryClient, note)
      void refreshLibrary(queryClient)
    },
  })
}

/** Move a note to the Trash, or bring it back, at its current revision. */
export function useNoteLifecycle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      action,
      documentId,
    }: {
      action: Lifecycle
      documentId: string
    }) => {
      const { summary } = await theorem().documents.get({
        documentId,
        schema: SCHEMA,
      })
      return mutate((headers) => {
        const { path, init } = lifecycleRequest(action, summary, headers)
        return theoremJson<Theorem.DocumentCommitReceipt>(path, init)
      })
    },
    onSuccess: (_receipt, { documentId }) => {
      void queryClient.invalidateQueries({ queryKey: noteKey(documentId) })
      void refreshLibrary(queryClient)
    },
  })
}

/** Make an agent-encoded note editable: Theorem copies it into an authored document. */
export function usePromoteNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      memoryDocId,
      contentAddress,
      title,
    }: NonNullable<NoteEntry['promotion']> & { title: string }) =>
      mutate((headers) =>
        theorem().documents.promote({
          ...headers,
          memoryDocId,
          schema: SCHEMA,
          idempotencyKey: headers['Idempotency-Key'],
          sourceMemoryDocId: memoryDocId,
          expectedContentAddress: contentAddress,
          title,
        }),
      ),
    onSuccess: () => void refreshLibrary(queryClient),
  })
}
