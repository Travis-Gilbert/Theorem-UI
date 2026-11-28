// SOURCING: @tanstack/react-query over the register's own reads (components/records/api readRecords for every class's records; lib/theorem/graphql for `dataLinks`, the graph's edges on one record with their confidence and provenance); the edges themselves are pure derivations over what the register, Documents and collections already hold, so nothing here stores a relationship
import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { readRecords } from '@/components/records/api'
import { recordItemId, recordTitle } from '@/components/records/model'
import type { RecordPage } from '@/components/records/contract'
import { graphql } from '@/lib/theorem/graphql'
import { classOfRef } from './classes'
import type { ClassRegistry } from './classes'
import type { CollectionEntry } from './collections'
import { byUpdated, useDocumentObjects } from './library'
import type { ObjectEntry, ObjectRef } from './library'

/**
 * One relationship between two objects. Explicit ones were declared (a
 * relation field, a collection's membership, a link written in a page);
 * provenance ones say where an object came from; inferred ones are the
 * register's guesses, below full confidence, or a mention by name.
 */
export type Connection = {
  id: string
  from: ObjectRef
  to: ObjectRef
  label: string
  kind: 'explicit' | 'provenance' | 'inferred'
  confidence?: number
}

const rowsOf = (results: { data?: RecordPage; isPending: boolean }[]) => ({
  pages: results.map((result) => result.data),
  pending: results.some((result) => result.isPending),
})

/** Every object of every browsable class: documents and register records, newest first. */
export function useAllObjects(registry: ClassRegistry) {
  const documents = useDocumentObjects(registry)
  const recordClasses = useMemo(
    () => registry.workspace.filter((cls) => !cls.native),
    [registry],
  )
  const records = useQueries({
    queries: recordClasses.map((cls) => ({
      queryKey: ['theorem', 'records', 'all', cls.type.node_label],
      queryFn: () => readRecords(cls.type.node_label),
      staleTime: 15_000,
    })),
    combine: rowsOf,
  })
  const entries = useMemo(() => {
    const out: ObjectEntry[] = [...documents.entries]
    recordClasses.forEach((cls, index) => {
      for (const row of records.pages[index]?.rows ?? [])
        out.push({
          ref: recordItemId(cls.type, row.id),
          cls,
          title: recordTitle(cls.type, row),
          record: row,
          origin: 'unknown',
        })
    })
    return out.sort(byUpdated)
  }, [documents.entries, recordClasses, records.pages])
  return {
    entries,
    isPending: documents.isPending || records.pending,
    error: documents.error,
  }
}

// Edges

const NOTE_LINK = /\/notes\/([A-Za-z0-9_-]{6,})/g

/**
 * The connections among `entries`: relation fields, collection membership,
 * links between pages, shared runs and promotions, and mentions by name in
 * the pages whose text is at hand.
 */
export function connectionsOf({
  entries,
  registry,
  collections,
  markdown = new Map(),
}: {
  entries: ObjectEntry[]
  registry: ClassRegistry
  collections: CollectionEntry[]
  /** Page text by document id, for the pages already read. */
  markdown?: ReadonlyMap<string, string>
}): Connection[] {
  const present = new Set(entries.map((entry) => entry.ref))
  const out = new Map<string, Connection>()
  const add = (connection: Omit<Connection, 'id'>) => {
    if (connection.from === connection.to) return
    if (!present.has(connection.from) || !present.has(connection.to)) return
    const id = `${connection.kind}:${connection.label}:${connection.from}>${connection.to}`
    if (!out.has(id)) out.set(id, { ...connection, id })
  }

  // Declared relation fields, typed and directed by the class that declares them.
  for (const entry of entries) {
    if (!entry.record) continue
    for (const field of entry.cls.type.fields) {
      if (field.field_type.kind !== 'relation') continue
      const target = classOfRef(
        registry,
        field.field_type.target_object_type_id,
      )
      if (!target) continue
      const value = entry.record.values[field.key]
      const ids = [
        ...(entry.record.relations[field.key] ?? []),
        ...(Array.isArray(value) ? value : value ? [value] : []),
      ].filter((id): id is string => typeof id === 'string')
      for (const id of ids)
        add({
          from: entry.ref,
          to: target.native ? id : recordItemId(target.type, id),
          label: field.label,
          kind: 'explicit',
        })
    }
  }

  // A collection contains its members.
  for (const collection of collections) {
    const ref = registry.collection
      ? recordItemId(registry.collection.type, collection.id)
      : undefined
    if (!ref) continue
    for (const member of collection.members)
      add({ from: ref, to: member, label: 'Contains', kind: 'explicit' })
  }

  const byTitle = new Map<string, ObjectRef>()
  for (const entry of entries)
    if (entry.title.trim().length >= 4)
      byTitle.set(entry.title.trim().toLowerCase(), entry.ref)

  for (const entry of entries) {
    if (!entry.documentId) continue
    const text = markdown.get(entry.documentId)
    if (!text) continue
    // A link written in the page is explicit.
    for (const match of text.matchAll(NOTE_LINK))
      add({
        from: entry.ref,
        to: match[1]!,
        label: 'Links to',
        kind: 'explicit',
      })
    // A title named in the text is a guess.
    const lower = text.toLowerCase()
    for (const [title, ref] of byTitle)
      if (ref !== entry.ref && lower.includes(title))
        add({ from: entry.ref, to: ref, label: 'Mentions', kind: 'inferred' })
  }

  // Objects made in the same run share where they came from.
  const byRun = new Map<string, ObjectRef[]>()
  for (const entry of entries)
    for (const run of entry.runs ?? [])
      byRun.set(run, [...(byRun.get(run) ?? []), entry.ref])
  for (const refs of byRun.values())
    for (let i = 1; i < refs.length; i++)
      add({
        from: refs[0]!,
        to: refs[i]!,
        label: 'Made in the same run',
        kind: 'provenance',
      })
  for (const entry of entries)
    if (entry.promotedTo)
      add({
        from: entry.ref,
        to: entry.promotedTo,
        label: 'Promoted to',
        kind: 'provenance',
      })

  return [...out.values()]
}

/** The connections that touch `ref`, split by direction. */
export function connectionsAt(connections: Connection[], ref: ObjectRef) {
  return {
    outgoing: connections.filter((c) => c.from === ref),
    incoming: connections.filter((c) => c.to === ref),
  }
}

// The register's own edges on a record

export type GraphLink = {
  id: string
  from: string
  to: string
  type: string
  direction: 'in' | 'out'
  confidence?: number
  provenance: unknown[]
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Edges the graph holds on a record, including ones no field declares. */
export function useGraphLinks(recordId: string | undefined) {
  return useQuery({
    queryKey: ['theorem', 'objects', 'links', recordId],
    enabled: !!recordId,
    queryFn: async () => {
      const data = await graphql<{ dataLinks: unknown }>(
        `
          query Links($id: String!, $limit: Int) {
            dataLinks(id: $id, direction: "both", limit: $limit)
          }
        `,
        { id: recordId, limit: 100 },
      )
      const links = isObject(data.dataLinks) ? data.dataLinks.links : []
      return (Array.isArray(links) ? links : []).flatMap((raw): GraphLink[] =>
        isObject(raw) &&
        typeof raw.from_id === 'string' &&
        typeof raw.to_id === 'string'
          ? [
              {
                id: String(raw.id),
                from: raw.from_id,
                to: raw.to_id,
                type: typeof raw.type === 'string' ? raw.type : 'related',
                direction: raw.direction === 'in' ? 'in' : 'out',
                confidence:
                  typeof raw.confidence === 'number'
                    ? raw.confidence
                    : undefined,
                provenance: Array.isArray(raw.provenance) ? raw.provenance : [],
              },
            ]
          : [],
      )
    },
    staleTime: 15_000,
  })
}

/** A graph link read as a connection: below full confidence, or derived, it is inferred. */
export const linkKind = (link: GraphLink): Connection['kind'] =>
  link.confidence !== undefined && link.confidence < 1
    ? 'inferred'
    : link.provenance.length
      ? 'provenance'
      : 'explicit'
