// SOURCING: the records register's hooks (components/records/queries) over the standard library's Collection class: a collection is a record whose `members` hold object references, so membership never moves or copies an object, and folders (note-folders.ts) stay as they are
import { useMemo } from 'react'
import {
  flattenRows,
  useCreateRecord,
  useRecords,
  useUpdateRecord,
} from '@/components/records/queries'
import type { ObjectType, RecordRow } from '@/components/records/contract'
import type { ClassRegistry } from './classes'
import type { ObjectRef } from './library'

export type CollectionEntry = {
  id: string
  name: string
  description: string
  members: ObjectRef[]
  favorites: boolean
  row: RecordRow
}

const membersOf = (value: unknown): ObjectRef[] =>
  Array.isArray(value)
    ? value.filter((ref): ref is string => typeof ref === 'string')
    : typeof value === 'string'
      ? (() => {
          try {
            return membersOf(JSON.parse(value))
          } catch {
            return []
          }
        })()
      : []

export const collectionEntry = (row: RecordRow): CollectionEntry => ({
  id: row.id,
  name: String(row.values.name ?? '').trim() || 'Untitled collection',
  description: String(row.values.description ?? ''),
  members: membersOf(row.values.members),
  favorites: row.values.purpose === 'favorites',
  row,
})

/** Membership with `ref` added or taken out; the order the person added in is kept. */
export const toggled = (members: ObjectRef[], ref: ObjectRef) =>
  members.includes(ref) ? members.filter((m) => m !== ref) : [...members, ref]

// A hook needs a type to bind its mutations to before the register has the class.
const PLACEHOLDER = {
  object_type_id: '',
  node_label: '',
} as ObjectType

export function useCollections(registry: ClassRegistry) {
  const type = registry.collection?.type
  const rows = useRecords(type)
  const update = useUpdateRecord(type ?? PLACEHOLDER)
  const create = useCreateRecord(type ?? PLACEHOLDER)
  const collections = useMemo(
    () => flattenRows(rows.data).map(collectionEntry),
    [rows.data],
  )
  const favorites = collections.find((c) => c.favorites)
  return {
    available: !!type,
    collections,
    /** Curated collections, Favorites kept apart for the sidebar's Pinned group. */
    curated: collections.filter((c) => !c.favorites),
    favorites,
    isPending: rows.isPending && !!type,
    error: rows.error ?? update.error ?? create.error,
    /** The collections `ref` belongs to. */
    of: (ref: ObjectRef) => collections.filter((c) => c.members.includes(ref)),
    toggle: (collection: CollectionEntry, ref: ObjectRef) =>
      update.mutateAsync({
        id: collection.id,
        patch: { members: toggled(collection.members, ref) },
      }),
    create: (name: string, members: ObjectRef[] = []) =>
      create.mutateAsync({ name, members }),
    /** Star or unstar; Favorites is made the first time something is starred. */
    toggleFavorite: async (ref: ObjectRef) => {
      if (favorites)
        return update.mutateAsync({
          id: favorites.id,
          patch: { members: toggled(favorites.members, ref) },
        })
      await create.mutateAsync({
        name: 'Favorites',
        purpose: 'favorites',
        members: [ref],
      })
    },
    rename: (collection: CollectionEntry, name: string) =>
      update.mutateAsync({ id: collection.id, patch: { name } }),
  }
}

export type Collections = ReturnType<typeof useCollections>
