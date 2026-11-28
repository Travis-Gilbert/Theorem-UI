// SOURCING: @tanstack/react-query (the document index and each App's form, read through the note cache notes.ts already keeps), the Documents v2 client for listing, the records register's hooks (components/records/queries) for declared classes, note-canonical for a saved artifact's form
//
// Every object Notes shows, whatever owns it: a Documents v2 document for the
// standard library's Page, App and Notebook, a register record for any other
// class. One entry shape, so Library, the inspector and the graph treat a
// person's own class exactly as they treat Pages.
import { useInfiniteQuery, useQueries } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { flattenRows, useRecords } from '@/components/records/queries'
import { recordItemId, recordTitle } from '@/components/records/model'
import type { RecordRow } from '@/components/records/contract'
import { theorem } from '@/lib/theorem/client'
import type { Theorem } from '@/lib/theorem/client'
import { noteAttribute } from '@/lib/theorem/note-canonical'
import { nextPageParams } from '@/lib/theorem/note-library'
import {
  APP_KIND,
  fetchNote,
  isRetired,
  noteKey,
  noteLibraryKey,
} from '@/lib/theorem/notes'
import type { Note } from '@/lib/theorem/notes'
import type { ClassRegistry, ObjectClass } from './classes'

/**
 * How an object is named wherever Notes keeps a reference to it: a document
 * by its id, a record as `record:<class name>/<id>` (records/model).
 */
export type ObjectRef = string

/** Who made an object, as a table cell and as the inspector says it. */
export const ORIGIN_SHORT = {
  authored: 'You',
  encoded: 'Agent',
  unknown: 'Unknown',
} as const
export const ORIGIN_LONG = {
  authored: 'You',
  encoded: 'An agent, from memory',
  unknown: 'Not recorded',
} as const

export type ObjectEntry = {
  ref: ObjectRef
  cls: ObjectClass
  title: string
  /** The document a pane opens, for an object a Documents owner holds. */
  documentId?: string
  record?: RecordRow
  /** Theorem's history position of the last change, for sorting. */
  updated?: number
  created?: number
  /**
   * Who made it: a person, an agent encoding from memory, or not recorded.
   * A register record carries no author, so it says unknown.
   */
  origin: 'authored' | 'encoded' | 'unknown'
  /** Who touched it, from where, and in which run. */
  actors?: Theorem.ActorProvenance[]
  /** Runs that wrote it, for provenance between objects made together. */
  runs?: string[]
  /** The memory document an encoded object was made from. */
  encodedFrom?: string
  /** The document an encoded object was promoted into. */
  promotedTo?: string
}

/** A saved artifact's form, read from the source block (apps.ts FORM_ATTR). */
export const artifactForm = (note: Pick<Note, 'canonical'>) =>
  (note.canonical && noteAttribute(note.canonical, 'artifactForm')) ||
  'html-app'

const SCHEMA = 'theorem-document/2'

export const documentIndexKey = [...noteLibraryKey, 'objects'] as const

/**
 * Every live document the person can open, all pages read. Documents v2 has
 * no kind filter, so the standard classes are sorted from this one list.
 */
export function useDocumentIndex() {
  const query = useInfiniteQuery({
    queryKey: documentIndexKey,
    initialPageParam: undefined as ReturnType<typeof nextPageParams>,
    queryFn: ({ pageParam }) =>
      theorem().documents.list({
        schema: SCHEMA,
        limit: 100,
        includeAgentEncoded: false,
        ...pageParam,
      }),
    getNextPageParam: nextPageParams,
    select: (data) =>
      data.pages
        .flatMap((page) => page.documents)
        .filter((summary) => !isRetired(summary)),
    staleTime: 10_000,
  })
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage])
  return query
}

// Module level, so TanStack keeps the combined result while the notes stay the same.
const formsOf = (results: { data?: Note; isPending: boolean }[]) => ({
  forms: new Map(
    results.flatMap((result) =>
      result.data
        ? [[result.data.documentId, artifactForm(result.data)] as const]
        : [],
    ),
  ),
  pending: results.some((result) => result.isPending),
})

/** The form of each saved App, read through the note cache a pane shares. */
function useArtifactForms(summaries: Theorem.DocumentSummary[]) {
  const apps = summaries.filter((s) => s.documentKind === APP_KIND)
  return useQueries({
    queries: apps.map((summary) => ({
      queryKey: noteKey(summary.documentId),
      queryFn: () => fetchNote(summary.documentId),
      staleTime: 60_000,
    })),
    combine: formsOf,
  })
}

const documentEntry = (
  summary: Theorem.DocumentSummary,
  cls: ObjectClass,
): ObjectEntry => ({
  ref: summary.documentId,
  cls,
  title: summary.title.trim() || `Untitled ${cls.label.toLowerCase()}`,
  documentId: summary.documentId,
  updated: Number(summary.updatedPosition),
  created: Number(summary.createdPosition),
  origin: summary.origin.kind === 'agent_encoded' ? 'encoded' : 'authored',
  actors: summary.actors,
  runs: [
    ...new Set(
      summary.actors.flatMap((actor) => (actor.runId ? [actor.runId] : [])),
    ),
  ],
  ...(summary.origin.kind === 'agent_encoded'
    ? {
        encodedFrom: summary.origin.sourceMemoryDocId,
        promotedTo: summary.origin.promotedDocumentId,
      }
    : {}),
})

/** The standard library's objects, each document under the class that owns it. */
export function useDocumentObjects(registry: ClassRegistry) {
  const index = useDocumentIndex()
  const summaries = useMemo(() => index.data ?? [], [index.data])
  const { forms, pending: formsPending } = useArtifactForms(summaries)
  const entries = useMemo(() => {
    const out: ObjectEntry[] = []
    for (const summary of summaries) {
      const cls =
        summary.documentKind === APP_KIND
          ? registry.formClass(forms.get(summary.documentId) ?? 'html-app')
          : registry.native.page
      if (cls) out.push(documentEntry(summary, cls))
    }
    return out
  }, [summaries, forms, registry])
  return {
    entries,
    isPending: index.isPending,
    formsPending,
    error: index.error,
  }
}

/** A declared class's records as entries. */
export function useRecordObjects(cls: ObjectClass | undefined) {
  const records = useRecords(cls && !cls.native ? cls.type : undefined)
  const entries = useMemo<ObjectEntry[]>(
    () =>
      cls && !cls.native
        ? flattenRows(records.data).map((row) => ({
            ref: recordItemId(cls.type, row.id),
            cls,
            title: recordTitle(cls.type, row),
            record: row,
            origin: 'unknown',
          }))
        : [],
    [cls, records.data],
  )
  return { entries, query: records }
}

/** Newest change first; objects without a history position keep their order. */
export const byUpdated = (a: ObjectEntry, b: ObjectEntry) =>
  (b.updated ?? -1) - (a.updated ?? -1)
