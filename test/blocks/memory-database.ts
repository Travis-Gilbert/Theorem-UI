// SOURCING: @rustyreddb/node (the same engine as the browser's database, in
// memory). A test stands it where @rustyreddb/browser's worker would be: calls
// become promises, and a subscribed read is run again after each commit, as
// that worker does.
import { Database } from '@rustyreddb/node'
import type { OpenDatabase } from '@/lib/blocks/app-db'

type Read = Parameters<OpenDatabase['subscribe']>[0]

export interface MemoryDatabase extends OpenDatabase {
  closed: boolean
}

export function memoryDatabase(): MemoryDatabase {
  const database = Database.inMemory()
  const reads = new Set<() => void>()
  const attempt = <TValue>(read: () => TValue): Promise<TValue> => {
    try {
      return Promise.resolve(read())
    } catch (error) {
      return Promise.reject(error)
    }
  }
  const run = (read: Read): unknown => {
    switch (read.method) {
      case 'inspect':
        return database.inspect()
      case 'getNode':
        return database.getNode(read.args.id)
      case 'getEdge':
        return database.getEdge(read.args.id)
      case 'queryNodes':
        return database.queryNodes(read.args ?? {})
      case 'neighbors':
        return database.neighbors(read.args)
      case 'query':
        return database.query(
          read.args.cypher,
          read.args.params,
          read.args.rowCap,
        )
    }
  }
  const self: MemoryDatabase = {
    closed: false,
    inspect: () => attempt(() => database.inspect() as never),
    mutate: (batch) =>
      attempt(() => {
        const commit = database.mutate(batch)
        for (const publish of reads) publish()
        return commit
      }),
    getNode: (id) => attempt(() => database.getNode(id)),
    getEdge: (id) => attempt(() => database.getEdge(id)),
    queryNodes: (filter) => attempt(() => database.queryNodes(filter ?? {})),
    neighbors: (filter) => attempt(() => database.neighbors(filter as never)),
    query: (cypher, params, rowCap) =>
      attempt(() => database.query(cypher, params, rowCap)),
    subscribe: (read, next, error) => {
      let last: string | undefined
      const publish = () => {
        let value: unknown
        try {
          value = run(read)
        } catch (failure) {
          last = undefined
          error?.(failure as never)
          return
        }
        const text = JSON.stringify(value)
        if (text === last) return
        last = text
        next(value)
      }
      reads.add(publish)
      queueMicrotask(publish)
      return () => {
        reads.delete(publish)
      }
    },
    close: async () => {
      self.closed = true
      reads.clear()
      database.close()
    },
  }
  return self
}
