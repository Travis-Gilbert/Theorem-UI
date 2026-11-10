// SOURCING: lib/theorem/passthrough (theoremJson, the SDK's passthrough for routes its generated clients do not cover yet) with the shared CSRF and idempotency helper from lib/theorem/client; every fetch of /api/work/v1 is here, so SDK methods replace these callers when the SDK is regenerated
import { mutate } from '@/lib/theorem/client'
import { theoremJson } from '@/lib/theorem/passthrough'
import type {
  InboxAction,
  InboxBulkAction,
  InboxEntry,
  InboxPage,
  InboxState,
  NewWorkItem,
  SyncState,
  TimelineEvent,
  WorkFacets,
  WorkItem,
  WorkItemDetail,
  WorkItemPatch,
  WorkItemsPage,
  WorkProject,
  WorkProjectDetail,
  WorkQuery,
  WorkSettings,
  WorkView,
} from './contract'

export const WORK = '/api/work/v1'
export const WORK_EVENTS = `${WORK}/events`

const id = encodeURIComponent

function withQuery(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params))
    if (value !== undefined) query.set(key, value)
  const text = query.toString()
  return text ? `${path}?${text}` : path
}

/** A write: CSRF and an idempotency key, plus If-Match when the row is revisioned. */
const write = <T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  revision?: string,
) =>
  mutate((headers) =>
    theoremJson<T>(path, {
      method,
      body,
      headers: { ...headers, ...(revision ? { 'If-Match': revision } : {}) },
    }),
  )

// Settings

export const readSettings = () => theoremJson<WorkSettings>(`${WORK}/settings`)

/** The whole settings object goes back, with the revision it was read at. */
export const writeSettings = (settings: WorkSettings) =>
  write<WorkSettings>('PUT', `${WORK}/settings`, settings, settings.revision)

// Items

export const queryItems = (query: WorkQuery) =>
  theoremJson<WorkItemsPage>(`${WORK}/items/query`, {
    method: 'POST',
    body: query,
  })

export const readItem = (itemId: string) =>
  theoremJson<WorkItemDetail>(`${WORK}/items/${id(itemId)}`)

export const createItem = (input: NewWorkItem) =>
  write<WorkItem>('POST', `${WORK}/items`, input)

export const patchItem = (
  itemId: string,
  patch: WorkItemPatch,
  revision: string,
) => write<WorkItem>('PATCH', `${WORK}/items/${id(itemId)}`, patch, revision)

export const addComment = (itemId: string, bodyMarkdown: string) =>
  write<TimelineEvent>('POST', `${WORK}/items/${id(itemId)}/comments`, {
    bodyMarkdown,
  })

// Projects

export const listProjects = () =>
  theoremJson<{ projects: WorkProject[] }>(`${WORK}/projects`).then(
    (r) => r.projects,
  )

export const readProject = (projectId: string) =>
  theoremJson<WorkProjectDetail>(`${WORK}/projects/${id(projectId)}`)

// Views

export const listViews = () =>
  theoremJson<{ views: WorkView[] }>(`${WORK}/views`).then((r) => r.views)

/** Creates a view, or replaces one when `revision` is given. */
export const putView = (view: WorkView, revision?: string) =>
  write<WorkView>('PUT', `${WORK}/views/${id(view.id)}`, view, revision)

export const deleteView = (viewId: string) =>
  write<void>('DELETE', `${WORK}/views/${id(viewId)}`)

// Inbox

export const listInbox = (state: InboxState, cursor?: string) =>
  theoremJson<InboxPage>(withQuery(`${WORK}/inbox`, { state, cursor }))

export const actOnInbox = (
  entryId: string,
  action: InboxAction,
  until?: string,
) =>
  write<InboxEntry>('POST', `${WORK}/inbox/${id(entryId)}`, { action, until })

export const actOnInboxBulk = (action: InboxBulkAction) =>
  write<{ changed: number }>('POST', `${WORK}/inbox/actions`, { action })

// Facets and sync

export const readFacets = () => theoremJson<WorkFacets>(`${WORK}/facets`)

export const syncNow = (repo?: string) =>
  write<{ started: boolean; state: SyncState }>('POST', `${WORK}/sync`, {
    repo,
  })
