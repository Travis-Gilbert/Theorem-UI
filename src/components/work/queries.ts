// SOURCING: @tanstack/react-query (server state for the work tracker through the WorkSource: infinite queries for cursors, optimistic patches with rollback and If-Match revisions)
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useMemo } from 'react'
import { isSignedOut } from '@/lib/theorem/client'
import { isNotServed } from '@/lib/theorem/passthrough'
import {
  SETTINGS_KEY,
  applyInboxAction,
  applyPatch,
  findEntry,
  findItem,
  shiftUnread,
  workKeys,
  writeEntry,
  writeItem,
} from './cache'
import type {
  InboxAction,
  InboxBulkAction,
  InboxEntry,
  InboxState,
  NewWorkItem,
  WorkFacets,
  WorkItemDetail,
  WorkItemPatch,
  WorkItemsPage,
  WorkQuery,
  WorkSettings,
  WorkView,
} from './contract'
import { useWorkSource } from './source'

const retry = (failures: number, error: unknown) =>
  !isSignedOut(error) && !isNotServed(error) && failures < 1

/** Items a page asks for. */
export const PAGE_SIZE = 50

export function useWorkKeys() {
  const { id } = useWorkSource()
  return useMemo(() => workKeys(id), [id])
}

// Reads

export function useWorkItems(query: Omit<WorkQuery, 'cursor'>) {
  const source = useWorkSource()
  const keys = useWorkKeys()
  return useInfiniteQuery({
    queryKey: keys.itemList(query),
    queryFn: ({ pageParam }) =>
      source.queryItems({ ...query, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    retry,
  })
}

/** The loaded pages as one list, with what only the first page carries. */
export function flattenPages(data: { pages: WorkItemsPage[] } | undefined) {
  const pages = data?.pages ?? []
  return {
    items: pages.flatMap((p) => p.items),
    groups: pages[0]?.groups,
    total: pages[0]?.total ?? 0,
  }
}

export function useWorkItem(itemId: string | undefined) {
  const source = useWorkSource()
  const keys = useWorkKeys()
  return useQuery({
    queryKey: keys.item(itemId ?? ''),
    queryFn: () => source.getItem(itemId!),
    enabled: !!itemId,
    staleTime: 10_000,
    retry,
  })
}

export function useWorkProjects() {
  const source = useWorkSource()
  const keys = useWorkKeys()
  return useQuery({
    queryKey: keys.projects,
    queryFn: () => source.listProjects(),
    staleTime: 30_000,
    retry,
  })
}

export function useWorkProject(projectId: string | undefined) {
  const source = useWorkSource()
  const keys = useWorkKeys()
  return useQuery({
    queryKey: keys.project(projectId ?? ''),
    queryFn: () => source.getProject(projectId!),
    enabled: !!projectId,
    staleTime: 30_000,
    retry,
  })
}

export function useWorkViews() {
  const source = useWorkSource()
  const keys = useWorkKeys()
  return useQuery({
    queryKey: keys.views,
    queryFn: () => source.listViews(),
    staleTime: 30_000,
    retry,
  })
}

/** One view by id, once the list has loaded. */
export function useWorkView(viewId: string | undefined) {
  const views = useWorkViews()
  return {
    ...views,
    view: views.data?.find((v) => v.id === viewId),
  }
}

export function useWorkFacets() {
  const source = useWorkSource()
  const keys = useWorkKeys()
  return useQuery({
    queryKey: keys.facets,
    queryFn: () => source.facets(),
    staleTime: 60_000,
    retry,
  })
}

export function useWorkInbox(state: InboxState) {
  const source = useWorkSource()
  const keys = useWorkKeys()
  return useInfiniteQuery({
    queryKey: keys.inboxList(state),
    queryFn: ({ pageParam }) => source.listInbox!(state, pageParam),
    enabled: !!source.listInbox,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 10_000,
    retry,
  })
}

/** The unread count, from the cheapest list that carries it. */
export function useInboxUnread() {
  const { data } = useWorkInbox('unread')
  return data?.pages[0]?.unreadCount
}

// Writes

type PatchVariables = { id: string; patch: WorkItemPatch }

/**
 * Edits an item. The caches show the change at once; the server's answer
 * replaces it, and a refusal puts the item back as it was. Edits go one at a
 * time, each sent with the revision the last one returned, so two quick ones
 * do not race on If-Match. `report` hears a refusal after the item is back.
 */
export function usePatchWorkItem(report?: (error: unknown) => void) {
  const source = useWorkSource()
  const keys = useWorkKeys()
  const client = useQueryClient()
  return useMutation({
    scope: { id: `theorem:work:${source.id}:patch` },
    mutationFn: ({ id, patch }: PatchVariables) => {
      const current = findItem(client, keys, id)
      return source.patchItem!(id, patch, current?.revision ?? '')
    },
    onMutate: async ({ id, patch }: PatchVariables) => {
      await client.cancelQueries({ queryKey: keys.items })
      await client.cancelQueries({ queryKey: keys.item(id) })
      const before = findItem(client, keys, id)
      if (before)
        writeItem(
          client,
          keys,
          applyPatch(before, patch, client.getQueryData<WorkFacets>(keys.facets)),
        )
      return { before }
    },
    // Here, not in a `mutate` callback: those are dropped once the component that asked has unmounted, and an edit that moves a row to another group unmounts it.
    onError: (error, _variables, context) => {
      if (context?.before) writeItem(client, keys, context.before)
      report?.(error)
    },
    onSuccess: (item) => writeItem(client, keys, item),
    onSettled: (_item, _error, { id }) => {
      void client.invalidateQueries({ queryKey: keys.item(id) })
      void client.invalidateQueries({ queryKey: keys.projects })
      // The server's answer can move the item out of a filtered list or
      // reorder it, so the lists in front of the person read again.
      void client.invalidateQueries({ queryKey: keys.items, refetchType: 'active' })
    },
  })
}

export function useCreateWorkItem() {
  const source = useWorkSource()
  const keys = useWorkKeys()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: NewWorkItem) => source.createItem!(input),
    onSuccess: (item) => {
      client.setQueryData(keys.item(item.id), { item, timeline: [] })
      void client.invalidateQueries({ queryKey: keys.items })
      void client.invalidateQueries({ queryKey: keys.projects })
    },
  })
}

export function useAddComment(itemId: string) {
  const source = useWorkSource()
  const keys = useWorkKeys()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (bodyMarkdown: string) => source.comment!(itemId, bodyMarkdown),
    onSuccess: (event) => {
      client.setQueryData<WorkItemDetail>(
        keys.item(itemId),
        (detail) =>
          detail
            ? {
                item: {
                  ...detail.item,
                  commentCount: detail.item.commentCount + 1,
                },
                timeline: [...detail.timeline, event],
              }
            : detail,
      )
      void client.invalidateQueries({ queryKey: keys.items, refetchType: 'none' })
    },
  })
}

export function useSaveWorkView() {
  const source = useWorkSource()
  const keys = useWorkKeys()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ view, revision }: { view: WorkView; revision?: string }) =>
      source.saveView!(view, revision),
    onSettled: () => void client.invalidateQueries({ queryKey: keys.views }),
  })
}

export function useDeleteWorkView() {
  const source = useWorkSource()
  const keys = useWorkKeys()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (viewId: string) => source.deleteView!(viewId),
    onSettled: () => void client.invalidateQueries({ queryKey: keys.views }),
  })
}

type InboxVariables = { entry: InboxEntry; action: InboxAction; until?: string }

/** Marks, snoozes or archives an entry; the lists show it at once and the unread count follows. */
export function useInboxAction() {
  const source = useWorkSource()
  const keys = useWorkKeys()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ entry, action, until }: InboxVariables) =>
      source.actOnInbox!(entry.id, action, until),
    onMutate: async ({ entry, action, until }: InboxVariables) => {
      await client.cancelQueries({ queryKey: keys.inbox })
      const before = findEntry(client, keys, entry.id) ?? entry
      const after = applyInboxAction(before, action, until)
      writeEntry(client, keys, after)
      const counted = (e: InboxEntry) => !e.readAt && !e.archivedAt
      shiftUnread(client, keys, Number(counted(after)) - Number(counted(before)))
      return { before, after }
    },
    onError: (_error, _variables, context) => {
      if (!context) return
      writeEntry(client, keys, context.before)
      const counted = (e: InboxEntry) => !e.readAt && !e.archivedAt
      shiftUnread(
        client,
        keys,
        Number(counted(context.before)) - Number(counted(context.after)),
      )
    },
    onSettled: () => void client.invalidateQueries({ queryKey: keys.inbox }),
  })
}

export function useInboxBulk() {
  const source = useWorkSource()
  const keys = useWorkKeys()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (action: InboxBulkAction) => source.actOnInboxBulk!(action),
    onSettled: () => void client.invalidateQueries({ queryKey: keys.inbox }),
  })
}

export function useSyncNow() {
  const source = useWorkSource()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (repo?: string) => source.sync!(repo),
    onSuccess: ({ state }) =>
      client.setQueryData<WorkSettings>(SETTINGS_KEY, (settings) =>
        settings ? { ...settings, sync: state } : settings,
      ),
  })
}
