// SOURCING: the platform fetch and EventSource APIs (EventSource reconnects
// on its own) against the routes in docs/desktop/workspace-routes.md. A thin
// adapter that implements WorkspaceClient; nothing here models the workspace.
import { WorkspaceConflictError } from './types'
import type {
  FileContent,
  FolderSettings,
  SearchHit,
  WorkspaceClient,
  WorkspaceEntry,
  WorkspaceEvent,
  WorkspaceGraph,
  WorkspaceLink,
  WorkspaceSummary,
} from './types'

const BASE = '/desktop/workspace'

/** A workspace route answered with an error other than a write conflict. */
export class WorkspaceRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'WorkspaceRequestError'
  }
}

interface Problem {
  code?: string
  detail?: string
  currentHash?: string | null
}

async function problemOf(response: Response): Promise<Problem> {
  try {
    return (await response.json()) as Problem
  } catch {
    return {}
  }
}

async function fail(response: Response): Promise<never> {
  const problem = await problemOf(response)
  throw new WorkspaceRequestError(
    response.status,
    problem.code ?? 'request_failed',
    problem.detail ?? `${response.url} answered ${response.status}`,
  )
}

export interface DesktopClientOptions {
  /** Defaults to the global fetch. */
  fetch?: typeof fetch
  /** Defaults to `new EventSource(url)`. */
  eventSource?: (url: string) => EventSource
}

/**
 * The open workspaces, or null when this server has no workspace routes (the
 * page is not running in the desktop app).
 */
export async function listDesktopWorkspaces(
  fetcher: typeof fetch = fetch,
): Promise<Array<WorkspaceSummary> | null> {
  const response = await fetcher(BASE)
  if (response.status === 404) return null
  if (!response.ok) return fail(response)
  return (await response.json()) as Array<WorkspaceSummary>
}

/** A `WorkspaceClient` over the local server's workspace routes. */
export function createDesktopWorkspaceClient(
  workspace: WorkspaceSummary,
  options: DesktopClientOptions = {},
): WorkspaceClient {
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init))
  const openEvents =
    options.eventSource ?? ((url: string) => new EventSource(url))
  let current = workspace
  const base = `${BASE}/${encodeURIComponent(workspace.id)}`
  const url = (route: string, query?: Record<string, string>) =>
    query
      ? `${base}/${route}?${new URLSearchParams(query)}`
      : `${base}/${route}`

  async function request(
    route: string,
    query?: Record<string, string>,
    init?: RequestInit,
  ): Promise<Response> {
    const response = await fetcher(url(route, query), init)
    if (!response.ok) await fail(response)
    return response
  }
  const json = async <T>(
    route: string,
    query?: Record<string, string>,
    init?: RequestInit,
  ): Promise<T> => (await (await request(route, query, init)).json()) as T
  const post = (route: string, body: unknown, method = 'POST') =>
    request(route, undefined, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  // One event stream per client, open while anyone listens.
  const listeners = new Set<(event: WorkspaceEvent) => void>()
  let source: EventSource | null = null
  const dispatch = (event: WorkspaceEvent) => {
    for (const listener of listeners) listener(event)
  }
  function connect() {
    const stream = openEvents(url('events'))
    // Whatever changed before the stream opened, or while it reconnected, was
    // not seen; a view that fetched in that gap refetches.
    stream.onopen = () => dispatch({ type: 'resync' })
    stream.onmessage = (message: MessageEvent<string>) =>
      dispatch(JSON.parse(message.data) as WorkspaceEvent)
    source = stream
  }

  async function read(path: string): Promise<FileContent> {
    const response = await request('file', { path })
    const hash = response.headers.get('etag')?.replace(/^"|"$/g, '') ?? ''
    return { bytes: new Uint8Array(await response.arrayBuffer()), hash }
  }

  return {
    get workspace() {
      return current
    },
    tree: () => json<Array<WorkspaceEntry>>('tree'),
    read,
    async readText(path) {
      const { bytes, hash } = await read(path)
      return { text: new TextDecoder().decode(bytes), hash }
    },
    async write(path, data, { expectedHash } = {}) {
      const headers: Record<string, string> = {}
      if (typeof expectedHash === 'string')
        headers['if-match'] = `"${expectedHash}"`
      else if (expectedHash === null) headers['if-none-match'] = '*'
      const response = await fetcher(url('file', { path }), {
        method: 'PUT',
        headers,
        body: typeof data === 'string' ? data : new Blob([data as BlobPart]),
      })
      if (response.status === 412)
        throw new WorkspaceConflictError(
          path,
          (await problemOf(response)).currentHash ?? null,
        )
      if (!response.ok) await fail(response)
      return (await response.json()) as { hash: string }
    },
    async mkdir(path) {
      await post('mkdir', { path })
    },
    async rename(from, to) {
      await post('rename', { from, to })
    },
    async remove(path) {
      await request('file', { path }, { method: 'DELETE' })
    },
    async resolve(target, fromPath) {
      const { resolved } = await json<{ resolved: string | null }>('resolve', {
        target,
        from: fromPath,
      })
      return resolved
    },
    links: (path) => json<Array<WorkspaceLink>>('links', { path }),
    backlinks: (path) => json<Array<WorkspaceLink>>('backlinks', { path }),
    graph: () => json<WorkspaceGraph>('graph'),
    search: (query, { limit } = {}) =>
      json<Array<SearchHit>>('search', {
        q: query,
        ...(limit !== undefined && { limit: String(limit) }),
      }),
    tags: () => json<Array<{ tag: string; count: number }>>('tags'),
    properties: (path) => json<Record<string, unknown>>('properties', { path }),
    settings: () => json<FolderSettings>('settings'),
    async setSettings(settings) {
      const response = await post('settings', settings, 'PUT')
      return (await response.json()) as FolderSettings
    },
    async setTrusted(trusted) {
      const response = await post('trust', { trusted }, 'PUT')
      current = (await response.json()) as WorkspaceSummary
    },
    subscribe(listener) {
      listeners.add(listener)
      if (!source) connect()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          source?.close()
          source = null
        }
      }
    },
  }
}
