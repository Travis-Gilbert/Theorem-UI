// SOURCING: bun:test; bun:sqlite runs the app's own DDL (local-schema.ts) behind the expo-sqlite subset the store uses
import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { SCHEMA } from '@/lib/local-schema'
import { createOutboxStore, type OutboxDatabase } from './outbox-store'

function database(): OutboxDatabase {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA.replace('PRAGMA journal_mode = WAL;', ''))
  return {
    getAllSync: <T>(sql: string, params: (string | number)[]) => sqlite.query(sql).all(...params) as T[],
    runSync: (sql: string, params: (string | number)[]) => sqlite.query(sql).run(...params),
    withTransactionSync: (task: () => void) => sqlite.transaction(task)(),
  }
}

describe('outbox store', () => {
  test('replaces a thread queue in order and reads it back with its pause', () => {
    const store = createOutboxStore(database())
    store.save('th', [{ id: 'a', text: 'one' }, { id: 'b', text: 'two', uncertain: true }], true)
    store.save('other', [{ id: 'c', text: 'three' }], false)
    expect(store.load().find((entry) => entry.threadId === 'th')).toEqual({
      threadId: 'th',
      items: [{ id: 'a', text: 'one' }, { id: 'b', text: 'two', uncertain: true }],
      paused: true,
    })
    expect(store.load().find((entry) => entry.threadId === 'other')).toEqual({
      threadId: 'other',
      items: [{ id: 'c', text: 'three' }],
      paused: false,
    })
    // A replacement keeps only the new words.
    store.save('th', [{ id: 'd', text: 'four' }], false)
    expect(store.load().find((entry) => entry.threadId === 'th')).toEqual({
      threadId: 'th',
      items: [{ id: 'd', text: 'four' }],
      paused: false,
    })
  })

  test('a failed replacement rolls back, keeping the previous complete queue', () => {
    const store = createOutboxStore(database())
    store.save('th', [{ id: 'a', text: 'one' }, { id: 'b', text: 'two' }], false)
    // A duplicate id within the batch violates the primary key mid-transaction.
    expect(() => store.save('th', [{ id: 'x', text: 'new' }, { id: 'x', text: 'dup' }], true)).toThrow()
    // The old queue is intact: neither deleted nor half-written.
    expect(store.load()).toEqual([
      { threadId: 'th', items: [{ id: 'a', text: 'one' }, { id: 'b', text: 'two' }], paused: false },
    ])
  })

  test('a paused queue with no words still restores its pause', () => {
    const store = createOutboxStore(database())
    store.save('th', [], true)
    expect(store.load()).toEqual([{ threadId: 'th', items: [], paused: true }])
    store.save('th', [], false)
    expect(store.load()).toEqual([])
  })

  test('clear removes every thread', () => {
    const store = createOutboxStore(database())
    store.save('th', [{ id: 'a', text: 'one' }], true)
    store.clear()
    expect(store.load()).toEqual([])
  })
})