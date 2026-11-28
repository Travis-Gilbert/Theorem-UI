// SOURCING: @tanstack/react-query over Theorem's own graph read, GraphQL `dataNeighborhood` (the nodes within k hops of a set of records and every link among them, each with its confidence and provenance, tenant-scoped and bounded by the server), plus connections.ts's derivations for what the graph does not hold (a page's links, collection membership, runs); the seeds come from scoped.ts, so no graph read starts from every object
//
// The relationships Notes draws and lists. Between records they are the
// graph's own links, read for the scope in hand. Pages are Documents, not
// graph nodes, so their links come from their text and their membership.
import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { decodeRecord, readRecord } from '@/components/records/api'
import { parseRecordItemId } from '@/components/records/model'
import { recordKeys } from '@/components/records/queries'
import { graphql } from '@/lib/theorem/graphql'
import { fetchNote, noteKey } from '@/lib/theorem/notes'
import type { Note } from '@/lib/theorem/notes'
import type { ClassRegistry, ObjectClass } from './classes'
import type { CollectionEntry } from './collections'
import { connectionsOf, linkKind } from './connections'
import type { Connection, GraphLink } from './connections'
import type { ObjectEntry, ObjectRef } from './library'
import { noteEntry, recordEntry } from './scoped'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const decodeLink = (raw: unknown): GraphLink | undefined =>
  isObject(raw) &&
  typeof raw.from_id === 'string' &&
  typeof raw.to_id === 'string'
    ? {
        id: String(raw.id),
        from: raw.from_id,
        to: raw.to_id,
        type: typeof raw.type === 'string' ? raw.type : 'related',
        direction: raw.direction === 'in' ? 'in' : 'out',
        confidence:
          typeof raw.confidence === 'number' ? raw.confidence : undefined,
        provenance: Array.isArray(raw.provenance) ? raw.provenance : [],
      }
    : undefined

export type GraphNode = { id: string; labels: string[]; raw: unknown }

/** The graph around `ids`, as Theorem walks it: depth 0 is the links among them. */
export function useNeighborhood(ids: string[], depth: number, limit = 300) {
  const sorted = useMemo(() => [...new Set(ids)].sort(), [ids])
  return useQuery({
    queryKey: ['theorem', 'objects', 'neighborhood', sorted, depth, limit],
    enabled: sorted.length > 0,
    queryFn: async () => {
      const data = await graphql<{ dataNeighborhood: unknown }>(
        `
          query Neighborhood($ids: [String!]!, $depth: Int, $limit: Int) {
            dataNeighborhood(ids: $ids, depth: $depth, limit: $limit)
          }
        `,
        { ids: sorted, depth, limit },
      )
      const hood = isObject(data.dataNeighborhood) ? data.dataNeighborhood : {}
      const nodes = (Array.isArray(hood.records) ? hood.records : []).flatMap(
        (raw): GraphNode[] =>
          isObject(raw) && typeof raw.id === 'string'
            ? [
                {
                  id: raw.id,
                  labels: Array.isArray(raw.labels)
                    ? raw.labels.filter(
                        (l): l is string => typeof l === 'string',
                      )
                    : [],
                  raw,
                },
              ]
            : [],
      )
      const links = (Array.isArray(hood.links) ? hood.links : [])
        .map(decodeLink)
        .filter((link): link is GraphLink => !!link)
      return { nodes, links, truncated: hood.truncated === true }
    },
    staleTime: 15_000,
  })
}

/** The class a graph node belongs to, by its label. */
const classOfNode = (registry: ClassRegistry, node: GraphNode) =>
  registry.all.find(
    (cls) => !cls.native && node.labels.includes(cls.type.node_label),
  )

/** One object by its reference, read from its owner. */
export function useObjectEntry(
  registry: ClassRegistry,
  ref: ObjectRef | undefined,
) {
  const record = ref ? parseRecordItemId(ref) : undefined
  const read = useQuery<RecordRowOrNote>({
    queryKey: record ? recordKeys.record(record.recordId) : noteKey(ref ?? ''),
    enabled: !!ref,
    queryFn: async () =>
      record
        ? ((await readRecord(record.recordId)) ?? null)
        : await fetchNote(ref!),
    staleTime: 15_000,
  })
  const entry = useMemo(() => {
    if (!read.data) return undefined
    if (record) {
      const cls = registry.all.find(
        (c) => c.type.name_singular === record.nameSingular,
      )
      return cls && 'values' in read.data
        ? recordEntry(cls, read.data)
        : undefined
    }
    return ref && 'documentId' in read.data
      ? noteEntry(registry, ref, read.data)
      : undefined
  }, [read.data, record, registry, ref])
  return {
    entry,
    isPending: !!ref && read.isPending,
    error: read.error,
  }
}

type RecordRowOrNote = ReturnType<typeof decodeRecord> | null | Note

const NOTE_LINK = /\/notes\/([A-Za-z0-9_-]{6,})/g

const settledNotes = (
  results: { data?: Note; isPending: boolean; error: unknown }[],
) => ({
  notes: results.flatMap((r) => (r.data ? [r.data] : [])),
  pending: results.some((r) => r.isPending),
})

/**
 * The objects and connections of one scope. `seeds` are the objects the
 * scope starts from; `depth` hops are walked from the records among them
 * (and one hop of links written in the pages among them, for a local
 * graph). `markdown` is page text already read.
 */
export function useObjectGraph({
  registry,
  seeds,
  depth,
  collections,
  markdown,
  local,
}: {
  registry: ClassRegistry
  seeds: ObjectEntry[]
  depth: number
  collections: CollectionEntry[]
  markdown: ReadonlyMap<string, string>
  /** Walk out from the seeds' pages too, as a local graph does. */
  local?: boolean
}) {
  const recordIds = useMemo(
    () => seeds.flatMap((entry) => (entry.record ? [entry.record.id] : [])),
    [seeds],
  )
  const hood = useNeighborhood(recordIds, depth)

  // The pages a local graph's pages link to, read so they can be drawn.
  const linked = useMemo(() => {
    if (!local) return []
    const known = new Set(seeds.map((e) => e.ref))
    const out = new Set<string>()
    for (const entry of seeds) {
      const text = entry.documentId ? markdown.get(entry.documentId) : undefined
      for (const match of text?.matchAll(NOTE_LINK) ?? [])
        if (!known.has(match[1]!)) out.add(match[1]!)
    }
    return [...out].slice(0, 100)
  }, [local, seeds, markdown])
  const pages = useQueries({
    queries: linked.map((id) => ({
      queryKey: noteKey(id),
      queryFn: () => fetchNote(id),
      staleTime: 60_000,
    })),
    combine: settledNotes,
  })

  return useMemo(() => {
    const byRef = new Map<ObjectRef, ObjectEntry>()
    for (const entry of seeds) byRef.set(entry.ref, entry)
    const refOfNode = new Map<string, ObjectRef>()
    for (const entry of seeds)
      if (entry.record) refOfNode.set(entry.record.id, entry.ref)
    for (const node of hood.data?.nodes ?? []) {
      if (refOfNode.has(node.id)) continue
      const cls: ObjectClass | undefined = classOfNode(registry, node)
      const row = cls ? decodeRecord(node.raw) : undefined
      if (!cls || !row) continue
      const entry = recordEntry(cls, row)
      refOfNode.set(node.id, entry.ref)
      byRef.set(entry.ref, entry)
    }
    for (const note of pages.notes) {
      const entry = noteEntry(registry, note.documentId, note)
      if (entry) byRef.set(entry.ref, entry)
    }
    const entries = [...byRef.values()]

    const out = new Map<string, Connection>()
    for (const link of hood.data?.links ?? []) {
      const from = refOfNode.get(link.from) ?? link.from
      const to = refOfNode.get(link.to) ?? link.to
      const field = fieldLabel(byRef.get(from)?.cls, link.type)
      out.set(`graph:${link.id}`, {
        id: `graph:${link.id}`,
        from,
        to,
        label: field ?? link.type,
        kind: linkKind(link),
        confidence: link.confidence,
      })
    }
    // What the graph does not hold: page links, membership, shared runs.
    for (const c of connectionsOf({
      entries,
      registry,
      collections,
      markdown,
      fields: false,
    }))
      out.set(c.id, c)
    return {
      entries,
      connections: [...out.values()],
      truncated: hood.data?.truncated ?? false,
      isPending: hood.isPending && recordIds.length > 0,
      error: hood.error,
      pagesPending: pages.pending,
    }
  }, [
    seeds,
    hood.data,
    hood.isPending,
    hood.error,
    pages,
    registry,
    collections,
    markdown,
    recordIds.length,
  ])
}

/** A link's type read as the declaring field's label, when a field declares it. */
const fieldLabel = (cls: ObjectClass | undefined, type: string) =>
  cls?.type.fields.find((f) => f.key === type)?.label
