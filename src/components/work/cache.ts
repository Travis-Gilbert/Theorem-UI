// SOURCING: @tanstack/query-core (QueryClient cache edits for the work tracker: optimistic patches with rollback, and live events applied to the lists, details, inbox and projects already cached)
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { groupKeysOf } from './grouping'
import type {
  InboxAction,
  InboxEntry,
  InboxPage,
  InboxState,
  WorkFacets,
  WorkGroupBy,
  WorkItem,
  WorkItemDetail,
  WorkItemPatch,
  WorkItemsPage,
  WorkProject,
  WorkProjectDetail,
  WorkQuery,
  WorkSettings,
} from './contract'
import type { WorkSignal } from './source'

/** Query keys, `['theorem', 'work', <source>, ...]`; one source never reads another's rows. */
export function workKeys(sourceId: string) {
  const root = ['theorem', 'work', sourceId] as const
  return {
    root,
    items: [...root, 'items'] as const,
    itemList: (query: WorkQuery) => [...root, 'items', query] as const,
    item: (itemId: string) => [...root, 'item', itemId] as const,
    projects: [...root, 'projects'] as const,
    project: (projectId: string) => [...root, 'project', projectId] as const,
    views: [...root, 'views'] as const,
    inbox: [...root, 'inbox'] as const,
    inboxList: (state: InboxState) => [...root, 'inbox', state] as const,
    facets: [...root, 'facets'] as const,
  }
}
export type WorkKeys = ReturnType<typeof workKeys>

/** The tracker's own settings are Theorem's, not a source's. */
export const SETTINGS_KEY = ['theorem', 'work', 'settings'] as const

export type ItemPages = InfiniteData<WorkItemsPage, string | undefined>
export type InboxPages = InfiniteData<InboxPage, string | undefined>

// Items

/** The item with `patch` applied, ids resolved through the facets; what the server will answer, before it does. */
export function applyPatch(
  item: WorkItem,
  patch: WorkItemPatch,
  facets?: WorkFacets,
): WorkItem {
  const next: WorkItem = { ...item }
  if (patch.title !== undefined) next.title = patch.title
  if (patch.bodyMarkdown !== undefined) next.bodyMarkdown = patch.bodyMarkdown
  if (patch.priority !== undefined) next.priority = patch.priority
  if (patch.statusId !== undefined) {
    const status = facets?.statuses.find((s) => s.id === patch.statusId)
    if (status) next.status = status
  }
  if (patch.assignees)
    next.assignees = patch.assignees.flatMap(
      (id) =>
        item.assignees.find((a) => a.id === id) ??
        facets?.assignees.find((a) => a.id === id) ??
        [],
    )
  if (patch.labels)
    next.labels = patch.labels.flatMap(
      (id) =>
        item.labels.find((l) => l.id === id) ??
        facets?.labels.find((l) => l.id === id) ??
        [],
    )
  if (patch.projectId !== undefined)
    next.projectId = patch.projectId ?? undefined
  if (patch.milestoneId !== undefined)
    next.milestoneId = patch.milestoneId ?? undefined
  if (patch.dueAt !== undefined) next.dueAt = patch.dueAt ?? undefined
  return next
}

const listQueries = (client: QueryClient, keys: WorkKeys) =>
  client.getQueriesData<ItemPages>({ queryKey: keys.items })

/** The freshest cached copy of an item: its detail, else a list row. */
export function findItem(
  client: QueryClient,
  keys: WorkKeys,
  itemId: string,
): WorkItem | undefined {
  const detail = client.getQueryData<WorkItemDetail>(keys.item(itemId))
  if (detail) return detail.item
  for (const [, data] of listQueries(client, keys))
    for (const page of data?.pages ?? []) {
      const found = page.items.find((i) => i.id === itemId)
      if (found) return found
    }
  return undefined
}

/** A group's count moves by one when an edit moves an item between groups. */
function adjustGroups(
  page: WorkItemsPage,
  groupBy: WorkGroupBy,
  before: WorkItem,
  after: WorkItem,
): WorkItemsPage {
  if (!groupBy || !page.groups) return page
  const left = groupKeysOf(before, groupBy)
  const joined = groupKeysOf(after, groupBy)
  const delta = (key: string) =>
    (joined.includes(key) ? 1 : 0) - (left.includes(key) ? 1 : 0)
  return {
    ...page,
    groups: page.groups.map((g) => ({
      ...g,
      count: Math.max(0, g.count + delta(g.key)),
    })),
  }
}

/**
 * Replaces an item wherever it is cached: every list page and its detail.
 * Returns whether any list held it, so a caller can tell a new item from a
 * changed one.
 */
export function writeItem(
  client: QueryClient,
  keys: WorkKeys,
  item: WorkItem,
): boolean {
  let held = false
  for (const [key, data] of listQueries(client, keys)) {
    if (!data) continue
    const query = key[4] as WorkQuery | undefined
    const pages = data.pages.map((page, at) => {
      const index = page.items.findIndex((i) => i.id === item.id)
      if (index < 0) return page
      held = true
      const before = page.items[index]!
      const next = {
        ...page,
        items: page.items.with(index, { ...before, ...item }),
      }
      return at === 0 ? adjustGroups(next, query?.groupBy ?? null, before, item) : next
    })
    client.setQueryData<ItemPages>(key, { ...data, pages })
  }
  client.setQueryData<WorkItemDetail>(keys.item(item.id), (detail) =>
    detail ? { ...detail, item: { ...detail.item, ...item } } : detail,
  )
  return held
}

/** Takes an item out of every cached list and drops its detail. */
export function removeItem(client: QueryClient, keys: WorkKeys, itemId: string) {
  for (const [key, data] of listQueries(client, keys)) {
    if (!data) continue
    client.setQueryData<ItemPages>(key, {
      ...data,
      pages: data.pages.map((page) => {
        const gone = page.items.filter((i) => i.id === itemId).length
        return gone
          ? {
              ...page,
              items: page.items.filter((i) => i.id !== itemId),
              total: Math.max(0, page.total - gone),
            }
          : page
      }),
    })
  }
  client.removeQueries({ queryKey: keys.item(itemId) })
}

// Inbox

const now = () => new Date().toISOString()

/** The entry after `action`; `until` is the snooze time. */
export function applyInboxAction(
  entry: InboxEntry,
  action: InboxAction,
  until?: string,
  at: string = now(),
): InboxEntry {
  switch (action) {
    case 'read':
      return { ...entry, readAt: entry.readAt ?? at }
    case 'unread':
      return { ...entry, readAt: undefined }
    case 'snooze':
      return { ...entry, snoozedUntil: until }
    case 'archive':
      return { ...entry, archivedAt: at }
    case 'unarchive':
      return { ...entry, archivedAt: undefined, snoozedUntil: undefined }
  }
}

/** Whether an entry belongs under a state filter at `at`; snoozed entries leave the others until due. */
export function inboxStateIncludes(
  state: InboxState,
  entry: InboxEntry,
  at: string = now(),
): boolean {
  if (entry.archivedAt) return state === 'archived'
  const snoozed = !!entry.snoozedUntil && entry.snoozedUntil > at
  if (state === 'snoozed') return snoozed
  if (state === 'archived') return false
  if (snoozed) return false
  return state === 'all' || !entry.readAt
}

const inboxQueries = (client: QueryClient, keys: WorkKeys) =>
  client.getQueriesData<InboxPages>({ queryKey: keys.inbox })

/** The cached entry with this id, from any state's list. */
export function findEntry(
  client: QueryClient,
  keys: WorkKeys,
  entryId: string,
): InboxEntry | undefined {
  for (const [, data] of inboxQueries(client, keys))
    for (const page of data?.pages ?? []) {
      const found = page.entries.find((e) => e.id === entryId)
      if (found) return found
    }
  return undefined
}

/**
 * Puts an entry where it belongs: replaced in the lists that hold it, taken
 * out of the ones whose state it no longer fits, added at the top of those it
 * now fits. `unreadCount`, when known, goes on every page.
 */
export function writeEntry(
  client: QueryClient,
  keys: WorkKeys,
  entry: InboxEntry,
  unreadCount?: number,
) {
  for (const [key, data] of inboxQueries(client, keys)) {
    if (!data) continue
    const state = key[4] as InboxState
    const fits = inboxStateIncludes(state, entry)
    const held = data.pages.some((p) => p.entries.some((e) => e.id === entry.id))
    const pages = data.pages.map((page, at) => {
      let entries = page.entries
      if (held)
        entries = fits
          ? entries.map((e) => (e.id === entry.id ? entry : e))
          : entries.filter((e) => e.id !== entry.id)
      else if (fits && at === 0) entries = [entry, ...entries]
      return {
        ...page,
        entries,
        unreadCount: unreadCount ?? page.unreadCount,
      }
    })
    client.setQueryData<InboxPages>(key, { ...data, pages })
  }
}

/** Every cached unread count moves by `delta`, which an optimistic read or unread makes. */
export function shiftUnread(client: QueryClient, keys: WorkKeys, delta: number) {
  if (!delta) return
  for (const [key, data] of inboxQueries(client, keys))
    if (data)
      client.setQueryData<InboxPages>(key, {
        ...data,
        pages: data.pages.map((p) => ({
          ...p,
          unreadCount: Math.max(0, p.unreadCount + delta),
        })),
      })
}

// Projects

function writeProject(client: QueryClient, keys: WorkKeys, project: WorkProject) {
  client.setQueryData<WorkProject[]>(keys.projects, (list) =>
    list
      ? list.some((p) => p.id === project.id)
        ? list.map((p) => (p.id === project.id ? project : p))
        : [...list, project]
      : list,
  )
  client.setQueryData<WorkProjectDetail>(keys.project(project.id), (detail) =>
    detail ? { ...detail, project } : detail,
  )
}

// Live events

/**
 * One live event applied to what is cached. A changed item is replaced in
 * place, so a row does not jump while a person is looking at it; lists that
 * held it are marked stale for their next read. An item no cached list holds
 * is new, or newly matches one, so the lists read again.
 */
export function applyWorkEvent(
  client: QueryClient,
  sourceId: string,
  event: WorkSignal,
) {
  const keys = workKeys(sourceId)
  switch (event.type) {
    case 'work.item.upserted': {
      const held = writeItem(client, keys, event.item)
      void client.invalidateQueries({
        queryKey: keys.items,
        refetchType: held ? 'none' : 'active',
      })
      void client.invalidateQueries({ queryKey: keys.item(event.item.id) })
      void client.invalidateQueries({ queryKey: keys.projects })
      return
    }
    case 'work.item.deleted':
      removeItem(client, keys, event.id)
      void client.invalidateQueries({ queryKey: keys.projects })
      return
    case 'work.inbox.upserted':
      writeEntry(client, keys, event.entry, event.unreadCount)
      return
    case 'work.project.upserted':
      writeProject(client, keys, event.project)
      return
    case 'work.sync':
      client.setQueryData<WorkSettings>(SETTINGS_KEY, (settings) =>
        settings ? { ...settings, sync: event.sync } : settings,
      )
      return
    case 'work.resync':
      void client.invalidateQueries({ queryKey: keys.root })
      void client.invalidateQueries({ queryKey: SETTINGS_KEY })
  }
}
