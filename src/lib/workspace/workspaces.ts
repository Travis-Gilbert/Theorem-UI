// SOURCING: @tanstack/react-query (the workspace list and each tree as server
// state, the tree kept current by the client's event stream) and the desktop
// host bridge for the folder picker. Nothing here models a workspace; it
// connects the WorkspaceClient to React.
//
// How a view reaches a folder workspace:
// - `useWorkspaces()` lists the open workspaces. `available` is false when the
//   page is not running in the desktop app, so views can hide themselves.
// - `useWorkspaceClient(id)` returns that workspace's `WorkspaceClient`, or
//   undefined while the list loads or once the folder is closed. Outside React,
//   `workspaceClient(summary)` returns the same instance.
// - `useWorkspaceTree(client)` is the workspace's entries, kept current.
// - `useOpenFolder()` is the "Open folder" action, or null without a host.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getDesktopHost } from '@/lib/desktop/host'
import {
  createDesktopWorkspaceClient,
  listDesktopWorkspaces,
} from './desktop-client'
import type {
  WorkspaceClient,
  WorkspaceEntry,
  WorkspaceEvent,
  WorkspaceId,
  WorkspaceSummary,
} from './types'

export const WORKSPACES_KEY = ['desktop', 'workspaces'] as const
export const workspaceTreeKey = (id: WorkspaceId) =>
  ['desktop', 'workspace', id, 'tree'] as const

/** One client per workspace, so its views share one event stream. */
const clients = new Map<WorkspaceId, WorkspaceClient>()

export function workspaceClient(summary: WorkspaceSummary): WorkspaceClient {
  let client = clients.get(summary.id)
  if (!client) {
    client = createDesktopWorkspaceClient(summary)
    clients.set(summary.id, client)
  }
  return client
}

/** The open folder workspaces. Empty, with `available` false, on the web. */
export function useWorkspaces() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: WORKSPACES_KEY,
    queryFn: () => listDesktopWorkspaces(),
    staleTime: Infinity,
    retry: false,
  })

  // The host changes the grants when a folder is opened or withdrawn.
  useEffect(
    () =>
      getDesktopHost()?.onEvent((event) => {
        if (event.type === 'grantsChanged')
          void queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY })
      }),
    [queryClient],
  )

  return {
    ...query,
    available: Boolean(query.data),
    workspaces: query.data ?? [],
  }
}

export function useWorkspaceClient(
  id: WorkspaceId,
): WorkspaceClient | undefined {
  const summary = useWorkspaces().workspaces.find((w) => w.id === id)
  return summary && workspaceClient(summary)
}

/** Asks the host for a folder and opens it. Null when there is no host. */
export function useOpenFolder() {
  const queryClient = useQueryClient()
  const host = getDesktopHost()
  const mutation = useMutation({
    mutationFn: async () => (await host?.pickFolder()) ?? null,
    onSuccess: (grant) => {
      if (grant)
        void queryClient.invalidateQueries({ queryKey: WORKSPACES_KEY })
    },
  })
  return host ? mutation : null
}

const within = (path: string, folder: string) =>
  path === folder || path.startsWith(`${folder}/`)

/**
 * A tree with one event applied. A folder's deletion or move carries what is
 * inside it, and applying an event twice changes nothing, so the per-entry
 * events that follow a folder's are harmless.
 */
export function applyWorkspaceEvent(
  entries: Array<WorkspaceEntry>,
  event: WorkspaceEvent,
): Array<WorkspaceEntry> {
  switch (event.type) {
    case 'created':
    case 'changed':
      return [
        ...entries.filter(
          (e) => e.id !== event.entry.id && e.path !== event.entry.path,
        ),
        event.entry,
      ]
    case 'deleted':
      return entries.filter(
        (e) => e.id !== event.id && !within(e.path, event.path),
      )
    case 'renamed':
      return entries.map((e) =>
        within(e.path, event.from)
          ? { ...e, path: event.to + e.path.slice(event.from.length) }
          : e,
      )
    default:
      return entries
  }
}

/**
 * One entry of a workspace's tree, from the cache `useWorkspaceTree` keeps
 * current. A view inside one that holds the tree (a file panel, a canvas)
 * reads entries without subscribing again.
 */
export function useWorkspaceEntry(client: WorkspaceClient, path: string | null) {
  return useQuery({
    queryKey: workspaceTreeKey(client.workspace.id),
    queryFn: () => client.tree(),
    staleTime: Infinity,
    select: (entries) => entries.find((e) => e.path === path),
  })
}

/** A workspace's entries, updated from its events as they arrive. */
export function useWorkspaceTree(client: WorkspaceClient) {
  const queryClient = useQueryClient()
  const id = client.workspace.id

  useEffect(
    () =>
      client.subscribe((event) => {
        if (event.type === 'indexed') return
        const queryKey = workspaceTreeKey(id)
        // A tree still on its way may predate the event, so fetch it again.
        if (
          event.type === 'resync' ||
          queryClient.getQueryState(queryKey)?.fetchStatus === 'fetching'
        ) {
          void queryClient.invalidateQueries({ queryKey })
          return
        }
        queryClient.setQueryData<Array<WorkspaceEntry>>(
          queryKey,
          (entries) => entries && applyWorkspaceEvent(entries, event),
        )
      }),
    [client, id, queryClient],
  )

  return useQuery({
    queryKey: workspaceTreeKey(id),
    queryFn: () => client.tree(),
    staleTime: Infinity,
  })
}
