// SOURCING: the bridge in protocol.ts. The method names and shapes are
// @rustyreddb/browser's, which the page holds; this is the frame's handle on
// one database the App declared with `db("name")`.
import { call } from './protocol'
import type {
  DbFailure,
  DbMethod,
  DbOutcome,
  PageMethods,
  Rpc,
} from './protocol'

export interface DbNode {
  id: string
  labels: Array<string>
  properties: Record<string, unknown>
}

export interface DbEdge {
  id: string
  from: string
  to: string
  type: string
  properties: Record<string, unknown>
}

/** One atomic commit. Deletes apply before upserts; deleting a node deletes its edges. */
export interface DbBatch {
  deleteEdges?: Array<string>
  deleteNodes?: Array<string>
  upsertNodes?: Array<DbNode>
  upsertEdges?: Array<DbEdge>
}

export interface DbNodeFilter {
  label?: string
  properties?: Record<string, unknown>
  prefix?: { property: string; value: string }
  limit?: number
}

export interface DbNeighborFilter {
  nodeId: string
  direction: 'out' | 'in'
  edgeType?: string
}

export interface DbNeighbor {
  edgeId: string
  nodeId: string
  type: string
  properties: Record<string, unknown>
}

export interface DbQueryResult {
  columns: Array<string>
  rows: Array<Array<unknown>>
  truncated: boolean
}

/** A read a subscription keeps current. */
export type DbSubscription =
  | { method: 'inspect' }
  | { method: 'getNode' | 'getEdge'; args: { id: string } }
  | { method: 'queryNodes'; args?: DbNodeFilter }
  | { method: 'neighbors'; args: DbNeighborFilter }
  | {
      method: 'query'
      args: {
        cypher: string
        params?: Record<string, unknown>
        rowCap?: number
      }
    }

/** A failed database call. `code` is stable, such as `read_only`. */
export class DbError extends Error {
  readonly code: string
  constructor({ code, message }: DbFailure) {
    super(message)
    this.name = 'DbError'
    this.code = code
  }
}

/**
 * An argument as JSON: the page accepts nothing else. An option left
 * `undefined` is dropped, as it would be in a request body.
 */
const json = (value: unknown): unknown =>
  value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as unknown)

function settle(outcome: DbOutcome): unknown {
  if (outcome.ok) return outcome.value
  throw new DbError(outcome.error)
}

interface Listener {
  next: (value: never) => void
  error?: (error: DbError) => void
}

/** The databases of one sandbox document, and the subscriptions it holds on them. */
export class Databases {
  private readonly listeners = new Map<number, Listener>()
  private nextId = 1

  constructor(private readonly rpc: Rpc) {}

  /** A subscribed read's result arrived from the page. */
  changed(id: number, outcome: DbOutcome): void {
    const listener = this.listeners.get(id)
    if (!listener) return
    if (outcome.ok) listener.next(outcome.value as never)
    else listener.error?.(new DbError(outcome.error))
  }

  open(name: string) {
    const run = async (method: DbMethod, args?: unknown) =>
      settle(
        await call<PageMethods, 'db.call'>(this.rpc, 'db.call', {
          name,
          method,
          args: json(args),
        }),
      )
    return {
      name,
      inspect: () =>
        run('inspect') as Promise<{
          writable: boolean
          version: number
          nodes: number
          edges: number
        }>,
      mutate: (batch: DbBatch) =>
        run('mutate', batch) as Promise<{
          txnId: number
          graphVersion: number
        }>,
      getNode: (id: string) => run('getNode', { id }) as Promise<DbNode | null>,
      getEdge: (id: string) => run('getEdge', { id }) as Promise<DbEdge | null>,
      queryNodes: (filter: DbNodeFilter = {}) =>
        run('queryNodes', filter) as Promise<Array<DbNode>>,
      neighbors: (filter: DbNeighborFilter) =>
        run('neighbors', filter) as Promise<Array<DbNeighbor>>,
      /** One read-only Cypher query with bound parameters. Writes go through `mutate`. */
      query: (
        cypher: string,
        params: Record<string, unknown> = {},
        rowCap?: number,
      ) => run('query', { cypher, params, rowCap }) as Promise<DbQueryResult>,
      /**
       * Keeps a read current: `next` gets its result now and again after any
       * commit that changes it, from this frame or another view of the App.
       * Returns the function that stops it.
       */
      subscribe: <TValue = unknown>(
        read: DbSubscription,
        next: (value: TValue) => void,
        error?: (error: DbError) => void,
      ): (() => void) => {
        const id = this.nextId++
        this.listeners.set(id, { next, error })
        call<PageMethods, 'db.subscribe'>(this.rpc, 'db.subscribe', {
          name,
          id,
          method: read.method,
          args: 'args' in read ? json(read.args) : undefined,
        }).catch((failure: unknown) => {
          this.listeners.delete(id)
          error?.(
            new DbError({
              code: 'subscription_refused',
              message:
                failure instanceof Error ? failure.message : String(failure),
            }),
          )
        })
        return () => {
          if (!this.listeners.delete(id)) return
          void call<PageMethods, 'db.unsubscribe'>(this.rpc, 'db.unsubscribe', {
            id,
          }).catch(() => {})
        }
      },
    }
  }
}

export type AppDatabase = ReturnType<Databases['open']>
