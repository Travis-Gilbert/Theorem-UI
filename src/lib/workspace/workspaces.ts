// SOURCING: @tanstack/react-query (the workspace list and each tree as server
// state, the tree kept current by the client's event stream) and the desktop
// host bridge for the folder picker. Nothing here models a workspace; it
// connects the WorkspaceClient to React.
//
// A workspace is the person's Theorem vault (on the web too, once signed in)
// or a folder they opened in the desktop app.
//
// How a view reaches a workspace:
// - `useWorkspaces()` lists the open workspaces, the Theorem vault first.
//   `available` is false when there is neither a vault nor the desktop app, so
//   views can hide themselves.
// - `useWorkspaceClient(id)` returns that workspace's `WorkspaceClient`, or
//   undefined while the list loads or once the folder is closed. Outside React,
//   `workspaceClient(summary)` returns the same instance.
// - `useWorkspaceTree(client)` is the workspace's entries, kept current.
// - `useIndexQuery(client, parts, fn)` is anything the index answers (links,
//   backlinks, search, tags, properties), fetched again as the index catches up.
// - `useFolderSettings(client)` and `useSaveFolderSettings(client)` are the
//   folder's own settings.
// - `useOpenFolder()` is the "Open folder" action, or null without a host.
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useEffect, useEffectEvent } from 'react'
import { getDesktopHost } from '@/lib/desktop/host'
import {
  createDesktopWorkspaceClient,
  listDesktopWorkspaces,
} from './desktop-client'
import {
  createTheoremWorkspaceClient,
  getTheoremVault,
  isTheoremWorkspace,
} from './theorem-client'
import type {
  FolderSettings,
  WorkspaceClient,
  WorkspaceEntry,
  WorkspaceEvent,
  WorkspaceId,
  WorkspaceSummary,
} from './types'

export const WORKSPACES_KEY = ['desktop', 'workspaces'] as const
export const THEOREM_VAULT_KEY = ['theorem', 'vault'] as const
export const workspaceTreeKey = (id: WorkspaceId) =>
  ['desktop', 'workspace', id, 'tree'] as const
/** The key of something the workspace index answers; see `useIndexQuery`. */
export const workspaceIndexKey = (
  id: WorkspaceId,
  parts: ReadonlyArray<unknown>,
) => ['desktop', 'workspace', id, 'index', ...parts] as const
const settingsKey = (id: WorkspaceId) =>
  ['desktop', 'workspace', id, 'settings'] as const

/** One client per workspace, so its views share one event stream. */
const clients = new Map<WorkspaceId, WorkspaceClient>()

export function workspaceClient(summary: WorkspaceSummary): WorkspaceClient {
  let client = clients.get(summary.id)
  if (!client) {
    client = isTheoremWorkspace(summary)
      ? createTheoremWorkspaceClient(summary)
      : createDesktopWorkspaceClient(summary)
    clients.set(summary.id, client)
  }
  return client
}

/**
 * The Theorem vault, then the open folders. Empty, with `available` false,
 * on the web while nobody is signed in.
 */
export function useWorkspaces() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: WORKSPACES_KEY,
    queryFn: () => listDesktopWorkspaces(),
    staleTime: Infinity,
    retry: false,
  })
  // Asked again now and then, so the vault appears once the person signs in
  // or the backend comes back.
  const vault = useQuery({
    queryKey: THEOREM_VAULT_KEY,
    queryFn: () => getTheoremVault(),
    staleTime: 60_000,
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
    isPending: query.isPending || vault.isPending,
    available: Boolean(query.data ?? vault.data),
    /** The desktop app's workspace routes answer, so folders can be opened. */
    folders: Boolean(query.data),
    workspaces: [...(vault.data ? [vault.data] : []), ...(query.data ?? [])],
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
export function useWorkspaceEntry(
  client: WorkspaceClient,
  path: string | null,
) {
  return useQuery({
    queryKey: workspaceTreeKey(client.workspace.id),
    queryFn: () => client.tree(),
    staleTime: Infinity,
    select: (entries) => entries.find((e) => e.path === path),
  })
}

/** Keeps a workspace's cached tree current with its events. */
function followTree(client: WorkspaceClient, queryClient: QueryClient) {
  const queryKey = workspaceTreeKey(client.workspace.id)
  return client.subscribe((event) => {
    if (event.type === 'indexed') return
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
  })
}

/** A workspace's entries, updated from its events as they arrive. */
export function useWorkspaceTree(client: WorkspaceClient) {
  const queryClient = useQueryClient()
  useEffect(() => followTree(client, queryClient), [client, queryClient])
  return useQuery({
    queryKey: workspaceTreeKey(client.workspace.id),
    queryFn: () => client.tree(),
    staleTime: Infinity,
  })
}

/** Every open workspace's entries, each with its client, kept current. */
export function useAllWorkspaceTrees() {
  const queryClient = useQueryClient()
  const open = useWorkspaces().workspaces.map(workspaceClient)
  const key = open.map((client) => client.workspace.id).join(' ')
  useEffect(() => {
    const stops = open.map((client) => followTree(client, queryClient))
    return () => stops.forEach((stop) => stop())
    // The clients are the same instances while the ids are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, queryClient])
  return useQueries({
    queries: open.map((client) => ({
      queryKey: workspaceTreeKey(client.workspace.id),
      queryFn: () => client.tree(),
      staleTime: Infinity,
    })),
    combine: (results) =>
      open.map((client, i) => ({
        client,
        entries: results[i]?.data ?? [],
        isPending: results[i]?.isPending ?? true,
      })),
  })
}

/**
 * Something the workspace index answers, keyed by `parts` within the
 * workspace. It is fetched again once the index has caught up with a change,
 * and when events may have been missed.
 */
export function useIndexQuery<T>(
  client: WorkspaceClient,
  parts: ReadonlyArray<unknown>,
  queryFn: () => Promise<T>,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const queryClient = useQueryClient()
  const queryKey = workspaceIndexKey(client.workspace.id, parts)
  const onEvent = useEffectEvent((event: WorkspaceEvent) => {
    if (event.type === 'indexed' || event.type === 'resync')
      void queryClient.invalidateQueries({ queryKey })
  })
  useEffect(() => client.subscribe((event) => onEvent(event)), [client])
  return useQuery({
    queryKey,
    queryFn,
    enabled,
    staleTime: Infinity,
    // The index is local; an answer that failed once fails again.
    retry: false,
    placeholderData: keepPreviousData,
  })
}

/** The folder's own settings, from `.theorem/settings.json`. */
export function useFolderSettings(client: WorkspaceClient) {
  return useQuery({
    queryKey: settingsKey(client.workspace.id),
    queryFn: () => client.settings(),
    staleTime: Infinity,
  })
}

export function useSaveFolderSettings(client: WorkspaceClient) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: FolderSettings) => client.setSettings(settings),
    onSuccess: (saved) =>
      queryClient.setQueryData(settingsKey(client.workspace.id), saved),
  })
}
