// SOURCING: @tanstack/react-query's useInfiniteQuery and useQueries over the owners' own paged reads: Documents v2 `list` (its server-side `query` search and position cursor, note-library nextPageParams) and the register's `find_many` record verb (components/records/api findRecords: server filters, sorts, offset and the matching count); a collection's members resolve through the note and record caches a pane already shares
//
// What a library shows is read for its scope, a page at a time, never every
// object of every class first. A class asks its owner; everything asks each
// owner for one page and more on demand; a collection resolves only its
// members.
import { useInfiniteQuery, useQueries } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { findRecords, readRecord } from '@/components/records/api'
import type { RecordFilter, RecordSort } from '@/components/records/api'
import type { ObjectType, RecordRow } from '@/components/records/contract'
import {
  parseRecordItemId,
  presentationOf,
  recordItemId,
  recordTitle,
} from '@/components/records/model'
import { recordKeys } from '@/components/records/queries'
import { theorem } from '@/lib/theorem/client'
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
import type { CollectionEntry } from './collections'
import {
  SCHEMA,
  artifactForm,
  documentEntry,
  useArtifactForms,
} from './library'
import type { ObjectEntry, ObjectRef } from './library'

export const PAGE = 60

export type Sort = 'updated' | 'created' | 'title'

/** The field a class's records are named by, which search and title sort read. */
export const titleField = (type: ObjectType) =>
  presentationOf(type).title ??
  (type.label_identifier_field === 'id' ? 'name' : type.label_identifier_field)

export const recordQuery = (
  type: ObjectType,
  search: string,
  sort: Sort,
): { filters: RecordFilter[]; sorts: RecordSort[] } => {
  const key = titleField(type)
  const needle = search.trim()
  return {
    filters: needle
      ? [{ field_key: key, operator: 'icontains', value: needle }]
      : [],
    sorts: sort === 'title' ? [{ field_key: key, direction: 'asc' }] : [],
  }
}

export const recordEntry = (cls: ObjectClass, row: RecordRow): ObjectEntry => ({
  ref: recordItemId(cls.type, row.id),
  cls,
  title: recordTitle(cls.type, row),
  record: row,
  origin: 'unknown',
})

export type Scoped = {
  entries: ObjectEntry[]
  /** How many match, when every owner involved says. */
  total?: number
  hasMore: boolean
  loadMore: () => void
  isPending: boolean
  isFetchingMore: boolean
  error: unknown
}

/** Documents, a page at a time, searched by Theorem. */
function useDocumentPages(search: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...noteLibraryKey, 'objects', 'paged', search.trim()],
    enabled,
    initialPageParam: undefined as ReturnType<typeof nextPageParams>,
    queryFn: ({ pageParam }) =>
      theorem().documents.list({
        schema: SCHEMA,
        limit: PAGE,
        includeAgentEncoded: false,
        ...(search.trim() ? { query: search.trim() } : {}),
        ...pageParam,
      }),
    getNextPageParam: nextPageParams,
    select: (data) =>
      data.pages
        .flatMap((page) => page.documents)
        .filter((summary) => !isRetired(summary)),
    staleTime: 10_000,
  })
}

function useDocumentEntries(
  registry: ClassRegistry,
  search: string,
  enabled: boolean,
  only?: ObjectClass,
) {
  const pages = useDocumentPages(search, enabled)
  const summaries = useMemo(() => pages.data ?? [], [pages.data])
  const { forms } = useArtifactForms(summaries)
  const entries = useMemo(() => {
    const out: ObjectEntry[] = []
    for (const summary of summaries) {
      const cls =
        summary.documentKind === APP_KIND
          ? registry.formClass(forms.get(summary.documentId) ?? 'html-app')
          : registry.native.page
      if (cls && (!only || cls.id === only.id))
        out.push(documentEntry(summary, cls))
    }
    return out
  }, [summaries, forms, registry, only])
  return { pages, entries }
}

/** One record class, a page at a time, filtered, sorted and counted by Theorem. */
function useRecordPages(
  cls: ObjectClass | undefined,
  search: string,
  sort: Sort,
) {
  const enabled = !!cls && !cls.native
  return useInfiniteQuery({
    queryKey: [
      ...recordKeys.rows(cls?.type.node_label ?? ''),
      'find',
      search.trim(),
      sort,
    ],
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      findRecords(cls!.id, {
        ...recordQuery(cls!.type, search, sort),
        offset: pageParam,
        limit: PAGE,
      }),
    getNextPageParam: (last) => {
      const next = last.offset + last.rows.length
      return last.rows.length && next < last.count ? next : undefined
    },
    staleTime: 15_000,
  })
}

const scopedOf = (
  entries: ObjectEntry[],
  query: {
    hasNextPage: boolean
    fetchNextPage: () => unknown
    isPending: boolean
    isFetchingNextPage: boolean
    error: unknown
  },
  total?: number,
): Scoped => ({
  entries,
  total,
  hasMore: query.hasNextPage,
  loadMore: () => {
    if (query.hasNextPage && !query.isFetchingNextPage)
      void query.fetchNextPage()
  },
  isPending: query.isPending,
  isFetchingMore: query.isFetchingNextPage,
  error: query.error,
})

/** A class's objects: its records, or the documents its owner holds. */
export function useClassObjects(
  registry: ClassRegistry,
  cls: ObjectClass | undefined,
  search: string,
  sort: Sort,
): Scoped {
  const records = useRecordPages(cls, search, sort)
  const documents = useDocumentEntries(registry, search, !!cls?.native, cls)
  const recordEntries = useMemo(
    () =>
      cls && !cls.native
        ? (records.data?.pages ?? []).flatMap((page) =>
            page.rows.map((row) => recordEntry(cls, row)),
          )
        : [],
    [cls, records.data],
  )
  if (cls?.native) return scopedOf(documents.entries, documents.pages)
  return scopedOf(recordEntries, records, records.data?.pages[0]?.count)
}

/**
 * Everything the workspace holds: one page from Documents and from each
 * record class, and another page from each when the person reads on.
 */
export function useEveryObject(
  registry: ClassRegistry,
  search: string,
  sort: Sort,
  enabled: boolean,
): Scoped {
  const [depth, setDepth] = useState(1)
  const documents = useDocumentEntries(registry, search, enabled)
  const classes = useMemo(
    () => (enabled ? registry.workspace.filter((cls) => !cls.native) : []),
    [registry, enabled],
  )
  const records = useQueries({
    combine: settled,
    queries: classes.map((cls) => ({
      queryKey: [
        ...recordKeys.rows(cls.type.node_label),
        'find',
        search.trim(),
        sort,
        'depth',
        depth,
      ],
      queryFn: () =>
        findRecords(cls.id, {
          ...recordQuery(cls.type, search, sort),
          limit: Math.min(PAGE * depth, 1000),
        }),
      staleTime: 15_000,
      placeholderData: keepPrevious,
    })),
  })
  const entries = useMemo(() => {
    const out = [...documents.entries]
    classes.forEach((cls, index) => {
      for (const row of records.data[index]?.rows ?? [])
        out.push(recordEntry(cls, row))
    })
    return out
  }, [documents.entries, classes, records.data])
  const recordsMore = records.data.some(
    (page) => page && page.rows.length < page.count,
  )
  const pages = documents.pages
  return {
    entries,
    total:
      !records.pending && !pages.hasNextPage
        ? documents.entries.length +
          records.data.reduce((sum, page) => sum + (page?.count ?? 0), 0)
        : undefined,
    hasMore: pages.hasNextPage || recordsMore,
    loadMore: () => {
      if (pages.hasNextPage && !pages.isFetchingNextPage)
        void pages.fetchNextPage()
      if (recordsMore && !records.fetching) setDepth((d) => d + 1)
    },
    isPending: (enabled && pages.isPending) || records.pending,
    isFetchingMore: pages.isFetchingNextPage || records.fetching,
    error: pages.error ?? records.error,
  }
}

// Module level, so TanStack keeps the combined result while the reads stay the same.
const settled = <T>(
  results: {
    data?: T
    isPending: boolean
    isFetching: boolean
    error: unknown
  }[],
) => ({
  data: results.map((result) => result.data),
  pending: results.some((result) => result.isPending),
  fetching: results.some((result) => result.isFetching),
  error: results.find((result) => result.error != null)?.error,
})

/** For reads of more than one kind, each cast where it is used. */
const settledMixed = (
  results: {
    data?: unknown
    isPending: boolean
    isFetching: boolean
    error: unknown
  }[],
) => settled(results)

const keepPrevious = <T>(previous: T | undefined) => previous

/** A collection's members, each read from its owner. */
export function useCollectionObjects(
  registry: ClassRegistry,
  collection: CollectionEntry | undefined,
): Scoped {
  const members = useMemo(() => collection?.members ?? [], [collection])
  const reads = useQueries({
    combine: settledMixed,
    queries: members.map((ref) => {
      const record = parseRecordItemId(ref)
      return record
        ? {
            queryKey: recordKeys.record(record.recordId),
            queryFn: async () => (await readRecord(record.recordId)) ?? null,
            staleTime: 15_000,
          }
        : {
            queryKey: noteKey(ref),
            queryFn: () => fetchNote(ref),
            staleTime: 60_000,
          }
    }),
  })
  const entries = useMemo(
    () =>
      members.flatMap((ref, index): ObjectEntry[] => {
        const data = reads.data[index]
        if (!data) return []
        const record = parseRecordItemId(ref)
        if (record) {
          const cls = registry.workspace.find(
            (c) => c.type.name_singular === record.nameSingular,
          )
          return cls ? [recordEntry(cls, data as RecordRow)] : []
        }
        return [noteEntry(registry, ref, data as Note)].filter(
          (entry): entry is ObjectEntry => !!entry,
        )
      }),
    [members, reads, registry],
  )
  return {
    entries,
    total: members.length,
    hasMore: false,
    loadMore: () => {},
    isPending: reads.pending,
    isFetchingMore: false,
    error: reads.error,
  }
}

export const noteEntry = (
  registry: ClassRegistry,
  ref: ObjectRef,
  note: Note,
): ObjectEntry | undefined => {
  if (note.retired) return undefined
  const cls =
    note.documentKind === APP_KIND
      ? registry.formClass(artifactForm(note))
      : registry.native.page
  if (!cls) return undefined
  return {
    ref,
    cls,
    title: note.title.trim() || `Untitled ${cls.label.toLowerCase()}`,
    documentId: note.documentId,
    origin: note.origin.kind === 'agent_encoded' ? 'encoded' : 'authored',
  }
}
