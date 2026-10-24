// SOURCING: none — test fixtures. An in-memory WorkspaceClient that keeps the
// contract's conflict rule (a write's expectedHash) and sends its events, and
// a React root with a QueryClient to render handler views into.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { parse as parseYaml } from 'yaml'
import { WorkspaceRequestError } from '#/lib/workspace/desktop-client'
import { WorkspaceConflictError } from '#/lib/workspace/types'
import type {
  ChangeOrigin,
  FolderSettings,
  WorkspaceClient,
  WorkspaceEntry,
  WorkspaceEvent,
} from '#/lib/workspace/types'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const sha256 = (bytes: Uint8Array) =>
  new Bun.CryptoHasher('sha256').update(bytes).digest('hex')

const encode = (data: string | Uint8Array) =>
  typeof data === 'string' ? new TextEncoder().encode(data) : data

export interface FakeWorkspace {
  client: WorkspaceClient
  /** The file's text as stored. */
  text: (path: string) => string | undefined
  /** Writes as another program would, with an `external` event. */
  external: (path: string, data: string | Uint8Array) => Promise<void>
  emit: (event: WorkspaceEvent) => void
  /** Every write the client was asked to make, in order. */
  writes: Array<{ path: string; expectedHash: string | null | undefined }>
}

export const DEFAULT_FOLDER_SETTINGS: FolderSettings = {
  attachments: './',
  dailyNotes: { folder: '', template: '' },
}

export function fakeWorkspace(
  files: Record<string, string | Uint8Array>,
  {
    path = '/tmp/vault',
    answers = {},
  }: {
    path?: string
    /** Answers for the index's queries, which the fake does not compute. */
    answers?: Partial<
      Pick<WorkspaceClient, 'links' | 'backlinks' | 'search' | 'tags'>
    >
  } = {},
): FakeWorkspace {
  const store = new Map<string, Uint8Array>()
  const folders = new Set<string>()
  let settings = DEFAULT_FOLDER_SETTINGS
  const ids = new Map<string, string>()
  let nextId = 1
  const idOf = (p: string) => {
    let id = ids.get(p)
    if (!id) ids.set(p, (id = `vf_${nextId++}`))
    return id
  }
  const entry = (p: string): WorkspaceEntry => ({
    id: idOf(p),
    path: p,
    kind: 'file',
    size: store.get(p)?.length ?? 0,
    mtimeMs: 1,
  })
  for (const [p, data] of Object.entries(files)) store.set(p, encode(data))

  const listeners = new Set<(event: WorkspaceEvent) => void>()
  const emit = (event: WorkspaceEvent) => {
    for (const listener of listeners) listener(event)
  }
  const writes: FakeWorkspace['writes'] = []

  function put(p: string, bytes: Uint8Array, origin: ChangeOrigin) {
    const existed = store.has(p)
    store.set(p, bytes)
    const hash = sha256(bytes)
    if (existed) emit({ type: 'changed', entry: entry(p), hash, origin })
    else emit({ type: 'created', entry: entry(p), origin })
    return hash
  }

  function read(p: string) {
    const bytes = store.get(p)
    if (!bytes) return Promise.reject(new Error(`${p} not found`))
    return Promise.resolve({ bytes, hash: sha256(bytes) })
  }

  const directories = () => {
    const dirs = new Set<string>(folders)
    for (const p of store.keys()) {
      const parts = p.split('/')
      for (let i = 1; i < parts.length; i++)
        dirs.add(parts.slice(0, i).join('/'))
    }
    return [...dirs].map((p): WorkspaceEntry => ({
      id: idOf(p),
      path: p,
      kind: 'directory',
      size: 0,
      mtimeMs: 1,
    }))
  }

  // A name already in use is refused as the server refuses it.
  const taken = (p: string) =>
    store.has(p) || directories().some((dir) => dir.path === p)
  const alreadyExists = (p: string) =>
    Promise.reject(
      new WorkspaceRequestError(409, 'already_exists', `${p} already exists`),
    )

  const client: WorkspaceClient = {
    workspace: {
      id: 'ws_test',
      name: 'Vault',
      path,
      trusted: false,
      policy: 'LocalOnly',
    },
    tree: () =>
      Promise.resolve([...directories(), ...[...store.keys()].map(entry)]),
    read,
    readText: async (p) => {
      const { bytes, hash } = await read(p)
      return { text: new TextDecoder().decode(bytes), hash }
    },
    write: (p, data, options) => {
      writes.push({ path: p, expectedHash: options?.expectedHash })
      const current = store.get(p)
      const expected = options?.expectedHash
      if (expected !== undefined) {
        const actual = current ? sha256(current) : null
        if (actual !== expected)
          return Promise.reject(new WorkspaceConflictError(p, actual))
      }
      return Promise.resolve({ hash: put(p, encode(data), 'app') })
    },
    mkdir: (p) => {
      if (taken(p)) return alreadyExists(p)
      folders.add(p)
      emit({
        type: 'created',
        entry: { ...entry(p), kind: 'directory', size: 0 },
        origin: 'app',
      })
      return Promise.resolve()
    },
    rename: (from, to) => {
      if (from !== to && taken(to)) return alreadyExists(to)
      const moved = (p: string) => p === from || p.startsWith(`${from}/`)
      const id = idOf(from)
      // Everything at or under `from` keeps its id under its new path.
      for (const p of [...ids.keys()].filter(moved)) {
        ids.set(to + p.slice(from.length), ids.get(p)!)
        ids.delete(p)
      }
      for (const p of [...store.keys()].filter(moved)) {
        store.set(to + p.slice(from.length), store.get(p)!)
        store.delete(p)
      }
      if (folders.delete(from)) folders.add(to)
      emit({ type: 'renamed', id, from, to, origin: 'app' })
      return Promise.resolve()
    },
    remove: (p) => {
      store.delete(p)
      folders.delete(p)
      emit({ type: 'deleted', id: idOf(p), path: p, origin: 'app' })
      return Promise.resolve()
    },
    resolve: (target) => {
      const paths = [...store.keys()]
      const found =
        paths.find((p) => p === target || p === `${target}.md`) ??
        paths.find(
          (p) => p.endsWith(`/${target}`) || p.endsWith(`/${target}.md`),
        )
      return Promise.resolve(found ?? null)
    },
    links: () => Promise.resolve([]),
    backlinks: () => Promise.resolve([]),
    search: () => Promise.resolve([]),
    tags: () => Promise.resolve([]),
    properties: async (p) => {
      const text = new TextDecoder().decode(store.get(p))
      const yaml = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1]
      return (yaml ? parseYaml(yaml) : {}) as Record<string, unknown>
    },
    settings: () => Promise.resolve(settings),
    setSettings: (next) => Promise.resolve((settings = next)),
    setTrusted: () => Promise.resolve(),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    ...answers,
  }

  return {
    client,
    text: (p) => {
      const bytes = store.get(p)
      return bytes && new TextDecoder().decode(bytes)
    },
    external: async (p, data) => {
      await act(async () => {
        put(p, encode(data), 'external')
        await Bun.sleep(5)
      })
      await settle()
    },
    emit: (event) => act(() => emit(event)),
    writes,
  }
}

/**
 * React Query notifies on a timer and views render after it, so give both a
 * few turns inside act.
 */
export async function settle(turns = 4) {
  for (let turn = 0; turn < turns; turn++) await act(() => Bun.sleep(5))
}

/** Waits inside act until `check` passes, or fails after `timeout` ms. */
export async function waitFor<T>(
  check: () => T,
  { timeout = 2000 }: { timeout?: number } = {},
): Promise<Exclude<NonNullable<T>, false>> {
  const start = Date.now()
  for (;;) {
    try {
      const value = check()
      if (value !== undefined && value !== null && value !== false)
        return value as Exclude<NonNullable<T>, false>
    } catch (error) {
      if (Date.now() - start > timeout) throw error
    }
    if (Date.now() - start > timeout)
      throw new Error('waitFor: the condition never held')
    await act(() => Bun.sleep(10))
  }
}

const roots: Array<Root> = []

/** Renders `ui` with a fresh QueryClient. Unmount everything with `cleanup`. */
export async function render(ui: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
  )
  await settle()
  return { container, queryClient, root }
}

export function cleanup() {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.innerHTML = ''
}
