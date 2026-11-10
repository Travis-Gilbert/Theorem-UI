// SOURCING: @rustyreddb/browser (the graph database, in a dedicated worker, on
// the origin private file system). Which App reaches which database, and that
// a saved revision may only read, is this app's capability model.
import type { Database } from '@rustyreddb/browser'
import type { AppDatabases } from './bridge'
import type { DbMethod, DbRead } from './sandbox/protocol'

/**
 * What this module needs of an open database. `@rustyreddb/browser`'s
 * `Database` is one.
 */
export type OpenDatabase = Pick<
  Database,
  | 'inspect'
  | 'mutate'
  | 'getNode'
  | 'getEdge'
  | 'queryNodes'
  | 'neighbors'
  | 'query'
  | 'subscribe'
  | 'close'
>

export type OpenDatabaseAt = (directory: string) => Promise<OpenDatabase>

/**
 * An App's data is not a history of itself and is not watched by anything
 * that reads control events, so neither is kept.
 */
const openInBrowser: OpenDatabaseAt = async (directory) => {
  const [{ open }, { default: wasm }] = await Promise.all([
    import('@rustyreddb/browser'),
    import('@rustyreddb/browser/rustyred.wasm?url'),
  ])
  return open(directory, {
    controlEvents: false,
    keepHistory: false,
    wasm,
    worker: new Worker(new URL('./app-db.worker.ts', import.meta.url), {
      type: 'module',
    }),
  })
}

/** How long a database stays open after its last frame left, in milliseconds. */
const LINGER_MS = 5_000

interface Held {
  database: Promise<OpenDatabase>
  users: number
  closing?: ReturnType<typeof setTimeout>
}

/**
 * The databases this page has open, by directory. The browser gives one
 * handle to a database's file, so every frame showing an App shares one.
 */
const held = new Map<string, Held>()

/**
 * The directory of an App's database in the origin private file system. It is
 * named by the App's document, not by a revision, so every revision of an App
 * reads the same records.
 */
export function appDatabaseDirectory(documentId: string, name: string): string {
  return `theorem-app.${documentId.replace(/[^A-Za-z0-9_-]/g, '_')}.${name}`
}

function acquire(
  directory: string,
  open: OpenDatabaseAt,
): Promise<OpenDatabase> {
  let entry = held.get(directory)
  if (!entry) {
    entry = { database: open(directory), users: 0 }
    held.set(directory, entry)
    // A failed open is not kept: the next frame tries again.
    entry.database.catch(() => {
      if (held.get(directory) === entry) held.delete(directory)
    })
  }
  clearTimeout(entry.closing)
  entry.closing = undefined
  entry.users += 1
  return entry.database
}

function release(directory: string): void {
  const entry = held.get(directory)
  if (!entry) return
  entry.users -= 1
  if (entry.users > 0) return
  // A new revision replaces the frame at once; lingering spares it a reopen.
  entry.closing = setTimeout(() => {
    if (held.get(directory) !== entry || entry.users > 0) return
    held.delete(directory)
    void entry.database.then((database) => database.close()).catch(() => {})
  }, LINGER_MS)
}

function run(
  database: OpenDatabase,
  method: DbMethod,
  args: unknown,
): Promise<unknown> {
  // The database checks each argument's shape itself and names what is wrong.
  const value = (args ?? {}) as never
  switch (method) {
    case 'inspect':
      return database.inspect()
    case 'mutate':
      return database.mutate(value)
    case 'getNode':
      return database.getNode((value as { id: string }).id)
    case 'getEdge':
      return database.getEdge((value as { id: string }).id)
    case 'queryNodes':
      return database.queryNodes(value)
    case 'neighbors':
      return database.neighbors(value)
    case 'query': {
      const { cypher, params, rowCap } = value as {
        cypher: string
        params?: Record<string, unknown>
        rowCap?: number
      }
      return database.query(cypher, params, rowCap)
    }
  }
}

export interface DocumentDatabases extends AppDatabases {
  /** Lets go of every database this view opened. */
  dispose: () => void
}

/**
 * The databases of one App document, for one view of it. `writable` false is
 * a saved revision: it reads the App's records and changes none.
 */
export function documentAppDatabases(
  documentId: string,
  options: { writable?: boolean; open?: OpenDatabaseAt } = {},
): DocumentDatabases {
  const { writable = true, open = openInBrowser } = options
  const opened = new Map<string, Promise<OpenDatabase>>()
  let disposed = false
  const database = (name: string): Promise<OpenDatabase> => {
    if (disposed)
      return Promise.reject(
        Object.assign(new Error('This view of the App has closed.'), {
          code: 'database_closed',
        }),
      )
    let mine = opened.get(name)
    if (!mine) {
      mine = acquire(appDatabaseDirectory(documentId, name), open)
      opened.set(name, mine)
    }
    return mine
  }
  return {
    async call(name, method, args) {
      if (method === 'mutate' && !writable)
        throw Object.assign(
          new Error(
            'This is a saved revision of the App. Open the App to change its data.',
          ),
          { code: 'read_only' },
        )
      return run(await database(name), method, args)
    },
    subscribe(name, read: { method: DbRead; args: unknown }, next, error) {
      let stop: (() => void) | undefined
      let stopped = false
      database(name).then(
        (db) => {
          if (stopped) return
          stop = db.subscribe(
            { method: read.method, args: read.args ?? undefined } as never,
            next,
            (failure) =>
              error({ code: failure.code, message: failure.message }),
          )
        },
        (failure: unknown) => {
          if (stopped) return
          const code = (failure as { code?: unknown } | null)?.code
          error({
            code: typeof code === 'string' ? code : 'database_failure',
            message:
              failure instanceof Error ? failure.message : String(failure),
          })
        },
      )
      return () => {
        stopped = true
        stop?.()
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const name of opened.keys())
        release(appDatabaseDirectory(documentId, name))
      opened.clear()
    },
  }
}
