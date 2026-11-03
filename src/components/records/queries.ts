// SOURCING: @tanstack/react-query (server state for the schema register and its records through ./api: infinite record pages, optimistic cell writes with rollback, schema writes that re-read the model)
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { isSignedOut } from '@/lib/theorem/client'
import * as api from './api'
import { recordTitle, resolveObjectType } from './model'
import type {
  DataModel,
  ObjectType,
  ObjectTypeInput,
  PinRequest,
  RecordPage,
  RecordRow,
} from './contract'

const RECORDS = ['theorem', 'records'] as const
const keys = {
  model: [...RECORDS, 'model'] as const,
  rows: (nodeLabel: string) => [...RECORDS, 'rows', nodeLabel] as const,
  record: (id: string) => [...RECORDS, 'record', id] as const,
}

const retry = (failures: number, error: unknown) =>
  !isSignedOut(error) && failures < 1

/** Whether records can be written here; undefined until the schema answers. */
export const useRecordWrites = () =>
  useQuery({
    queryKey: [...RECORDS, 'writes'],
    queryFn: api.readRecordWritesServed,
    staleTime: 5 * 60_000,
    retry,
  }).data

export const useDataModel = () =>
  useQuery({
    queryKey: keys.model,
    queryFn: () => api.readDataModel(true),
    staleTime: 30_000,
    retry,
  })

/** Declared types, live ones first by label; retired types stay out of views. */
export function activeObjectTypes(model: DataModel | undefined) {
  return (model?.objectTypes ?? [])
    .filter((type) => !type.retired)
    .sort((a, b) => a.label_plural.localeCompare(b.label_plural))
}

type Pages = InfiniteData<RecordPage, string | undefined>

export const useRecords = (objectType: ObjectType | undefined) =>
  useInfiniteQuery({
    queryKey: keys.rows(objectType?.node_label ?? ''),
    queryFn: ({ pageParam }) =>
      api.readRecords(objectType!.node_label, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.cursor,
    enabled: !!objectType,
    staleTime: 15_000,
    retry,
  })

export const flattenRows = (data: { pages: RecordPage[] } | undefined) =>
  data?.pages.flatMap((page) => page.rows) ?? []

/**
 * Loads the rows of every type a type's relations point at, and names a
 * related id from them. The returned function changes when a target's rows
 * arrive, so sorting and filtering by related titles re-run.
 */
export function useRelationTitleOf(
  model: DataModel | undefined,
  objectType: ObjectType | undefined,
) {
  const client = useQueryClient()
  const targets = useMemo(() => {
    const found = new Map<string, ObjectType>()
    for (const field of objectType?.fields ?? []) {
      if (field.field_type.kind !== 'relation') continue
      const target = resolveObjectType(
        model,
        field.field_type.target_object_type_id,
      )
      if (target) found.set(field.key, target)
    }
    return found
  }, [model, objectType])
  const [version, bump] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    const labels = new Set([...targets.values()].map((t) => t.node_label))
    for (const target of new Map(
      [...targets.values()].map((t) => [t.node_label, t]),
    ).values())
      void client.prefetchInfiniteQuery({
        queryKey: keys.rows(target.node_label),
        queryFn: ({ pageParam }) =>
          api.readRecords(target.node_label, pageParam),
        initialPageParam: undefined as string | undefined,
        staleTime: 15_000,
      })
    return client.getQueryCache().subscribe((event) => {
      const key = event.query.queryKey
      if (
        event.type === 'updated' &&
        key[2] === 'rows' &&
        labels.has(String(key[3])) &&
        event.action.type === 'success'
      )
        bump()
    })
  }, [client, targets])

  return useCallback(
    (fieldKey: string, id: string) => {
      void version
      const target = targets.get(fieldKey)
      if (!target) return id
      const row = flattenRows(
        client.getQueryData<Pages>(keys.rows(target.node_label)),
      ).find((r) => r.id === id)
      return row ? recordTitle(target, row) : id
    },
    [client, targets, version],
  )
}

/** A record from whatever page holds it, else read on its own. */
export function useRecord(objectType: ObjectType | undefined, id: string) {
  const client = useQueryClient()
  return useQuery({
    queryKey: keys.record(id),
    queryFn: async () => {
      const held = objectType
        ? flattenRows(
            client.getQueryData<Pages>(keys.rows(objectType.node_label)),
          ).find((row) => row.id === id)
        : undefined
      return held ?? (await api.readRecord(id)) ?? null
    },
    retry,
  })
}

/** Apply `change` to every cached copy of a type's rows and to single-record reads. */
function editRows(
  client: QueryClient,
  nodeLabel: string,
  change: (rows: RecordRow[]) => RecordRow[],
) {
  client.setQueryData<Pages>(keys.rows(nodeLabel), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            rows: change(page.rows),
          })),
        }
      : data,
  )
}

/** A new row lands on the last page, so it shows where Add New is. */
function appendRow(client: QueryClient, nodeLabel: string, row: RecordRow) {
  client.setQueryData<Pages>(keys.rows(nodeLabel), (data) => {
    if (!data?.pages.length) return data
    if (data.pages.some((page) => page.rows.some((r) => r.id === row.id)))
      return data
    const pages = [...data.pages]
    const last = pages[pages.length - 1]!
    pages[pages.length - 1] = { ...last, rows: [...last.rows, row] }
    return { ...data, pages }
  })
}

export function useUpdateRecord(objectType: ObjectType) {
  const client = useQueryClient()
  const rowsKey = keys.rows(objectType.node_label)
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: Record<string, unknown>
    }) => api.updateRecord(objectType.object_type_id, id, patch),
    onMutate: async ({ id, patch }) => {
      await client.cancelQueries({ queryKey: rowsKey })
      const before = client.getQueryData<Pages>(rowsKey)
      const record = client.getQueryData<RecordRow | null>(keys.record(id))
      const apply = (row: RecordRow) =>
        row.id === id ? { ...row, values: { ...row.values, ...patch } } : row
      editRows(client, objectType.node_label, (rows) => rows.map(apply))
      if (record) client.setQueryData(keys.record(id), apply(record))
      return { before, record }
    },
    onError: (_error, { id }, context) => {
      if (context?.before) client.setQueryData(rowsKey, context.before)
      if (context?.record) client.setQueryData(keys.record(id), context.record)
    },
  })
}

export function useCreateRecord(objectType: ObjectType) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.createRecord(objectType.object_type_id, values),
    onSuccess: (row) => {
      appendRow(client, objectType.node_label, row)
      // The model's record counts are now one short.
      void client.invalidateQueries({ queryKey: keys.model })
    },
  })
}

export function useDeleteRecords(objectType: ObjectType) {
  const client = useQueryClient()
  const rowsKey = keys.rows(objectType.node_label)
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids)
        await api.deleteRecord(objectType.object_type_id, id)
    },
    onMutate: async (ids) => {
      await client.cancelQueries({ queryKey: rowsKey })
      const before = client.getQueryData<Pages>(rowsKey)
      const gone = new Set(ids)
      editRows(client, objectType.node_label, (rows) =>
        rows.filter((row) => !gone.has(row.id)),
      )
      return { before }
    },
    onError: (_error, _ids, context) => {
      if (context?.before) client.setQueryData(rowsKey, context.before)
    },
    onSettled: () => void client.invalidateQueries({ queryKey: keys.model }),
  })
}

/** Schema writes re-read the model; the records keep their cache. */
function useSchemaWrite<TArgs, TResult>(
  run: (args: TArgs) => Promise<TResult>,
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: () => void client.invalidateQueries({ queryKey: keys.model }),
  })
}

export const useDeclareObjectType = () =>
  useSchemaWrite(
    ({ input, anchor }: { input: ObjectTypeInput; anchor?: string }) =>
      api.declareObjectType(input, anchor),
  )

export const usePinObserved = () =>
  useSchemaWrite((request: PinRequest) => api.pinObserved(request))

export const useRetireObjectType = () =>
  useSchemaWrite((objectTypeId: string) => api.retireObjectType(objectTypeId))
