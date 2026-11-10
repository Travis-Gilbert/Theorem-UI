// SOURCING: hand-roll — the WorkSource seam: the one interface the work components read and write through, so they can point at Theorem's /api/work/v1 (GitHub and local items), another tracker, or local items only. Events use the browser's EventSource, whose reconnect sends Last-Event-ID itself
import { createContext, createElement, useContext } from 'react'
import type { ReactNode } from 'react'
import * as api from './api'
import { WORK_EVENT_TYPES } from './contract'
import type {
  InboxAction,
  InboxBulkAction,
  InboxEntry,
  InboxPage,
  InboxState,
  NewWorkItem,
  SyncState,
  TimelineEvent,
  WorkEvent,
  WorkFacets,
  WorkItem,
  WorkItemDetail,
  WorkItemPatch,
  WorkItemsPage,
  WorkProject,
  WorkProjectDetail,
  WorkQuery,
  WorkView,
} from './contract'

/** What a live subscription delivers: a change, or a request to read everything again. */
export type WorkSignal = WorkEvent | { type: 'work.resync' }

/**
 * Where work lives. The reads are required; whatever a source cannot do it
 * leaves out, and the components hide the control rather than failing: no
 * `patchItem` makes the lists read-only, no `listInbox` drops the inbox.
 */
export interface WorkSource {
  /** Keys this source's cached rows, so two sources never share one. */
  id: string
  queryItems: (query: WorkQuery) => Promise<WorkItemsPage>
  getItem: (itemId: string) => Promise<WorkItemDetail>
  listProjects: () => Promise<WorkProject[]>
  getProject: (projectId: string) => Promise<WorkProjectDetail>
  listViews: () => Promise<WorkView[]>
  facets: () => Promise<WorkFacets>
  /** Calls `listener` for each live change; returns the way to stop. */
  subscribe: (listener: (signal: WorkSignal) => void) => () => void

  createItem?: (input: NewWorkItem) => Promise<WorkItem>
  /** `revision` is the item's, sent as If-Match. */
  patchItem?: (
    itemId: string,
    patch: WorkItemPatch,
    revision: string,
  ) => Promise<WorkItem>
  comment?: (itemId: string, bodyMarkdown: string) => Promise<TimelineEvent>
  /** Creates the view, or replaces it when `revision` is given. */
  saveView?: (view: WorkView, revision?: string) => Promise<WorkView>
  deleteView?: (viewId: string) => Promise<void>

  listInbox?: (state: InboxState, cursor?: string) => Promise<InboxPage>
  actOnInbox?: (
    entryId: string,
    action: InboxAction,
    until?: string,
  ) => Promise<InboxEntry>
  actOnInboxBulk?: (action: InboxBulkAction) => Promise<{ changed: number }>

  sync?: (repo?: string) => Promise<{ started: boolean; state: SyncState }>
}

const RECONNECT_MS = [1_000, 2_000, 5_000, 15_000, 30_000]

/**
 * The event stream. EventSource reconnects by itself after a dropped
 * connection and sends Last-Event-ID, so the server resumes where it left
 * off. When the server answers with an error the browser gives up (the
 * state turns CLOSED); this opens a new one after a delay, and because that
 * one has no cursor to send, asks for everything to be read again.
 */
export function subscribeToEvents(
  listener: (signal: WorkSignal) => void,
  open: (url: string) => EventSource = (url) => new EventSource(url),
): () => void {
  let source: EventSource | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let failures = 0

  const connect = (resync: boolean) => {
    source = open(api.WORK_EVENTS)
    if (resync) listener({ type: 'work.resync' })
    source.addEventListener('open', () => {
      failures = 0
    })
    for (const type of WORK_EVENT_TYPES)
      source.addEventListener(type, (message) => {
        try {
          const data = JSON.parse((message as MessageEvent<string>).data)
          listener({ type, ...data } as WorkEvent)
        } catch {
          // A frame that is not JSON is not ours; the next one is.
        }
      })
    source.addEventListener('error', () => {
      if (stopped || source?.readyState !== EventSource.CLOSED) return
      source.close()
      timer = setTimeout(
        () => connect(true),
        RECONNECT_MS[Math.min(failures++, RECONNECT_MS.length - 1)],
      )
    })
  }
  connect(false)

  return () => {
    stopped = true
    clearTimeout(timer)
    source?.close()
  }
}

/** Theorem's work tracker: /api/work/v1, GitHub and local items. */
export const theoremWorkSource: WorkSource = {
  id: 'theorem',
  queryItems: api.queryItems,
  getItem: api.readItem,
  listProjects: api.listProjects,
  getProject: api.readProject,
  listViews: api.listViews,
  facets: api.readFacets,
  subscribe: (listener) => subscribeToEvents(listener),
  createItem: api.createItem,
  patchItem: api.patchItem,
  comment: api.addComment,
  saveView: api.putView,
  deleteView: api.deleteView,
  listInbox: api.listInbox,
  actOnInbox: api.actOnInbox,
  actOnInboxBulk: api.actOnInboxBulk,
  sync: api.syncNow,
}

const WorkSourceContext = createContext<WorkSource>(theoremWorkSource)

/** Points the work components under it at another source. */
export function WorkSourceProvider({
  source,
  children,
}: {
  source: WorkSource
  children: ReactNode
}) {
  return createElement(WorkSourceContext.Provider, { value: source }, children)
}

export const useWorkSource = () => useContext(WorkSourceContext)
