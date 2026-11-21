// SOURCING: expo-sqlite through local-db.ts (withTransactionSync replaces a thread's queue atomically); the same narrow database type the other stores use, so tests run on bun:sqlite
//
// Messages waiting in the outbox survive termination here, under the command id
// they will be sent with, alongside the queue's pause. A row is the words the
// person queued and whether their last send had no definite answer. It never
// holds a credential, and it is cleared with the account (local-db.ts). The
// words stay here until the SDK journal owns the send (the outbox keeps the
// dispatched row until lease.send resolves), so a restart never loses them.
import type { QueuedMessage } from './queue'

/** The subset of expo-sqlite the store uses, so tests can supply their own. */
export type OutboxDatabase = {
  getAllSync<T>(sql: string, params: (string | number)[]): T[]
  runSync(sql: string, params: (string | number)[]): unknown
  withTransactionSync(task: () => void): void
}

export type OutboxStore = {
  /** Every thread's waiting messages, in order, with the queue's pause. */
  load(): { threadId: string; items: QueuedMessage[]; paused: boolean }[]
  /** Replaces one thread's queue and pause in one transaction. Durable before it returns. */
  save(threadId: string, items: QueuedMessage[], paused: boolean): void
  /** Signing out: nothing queued under one account may reach another. */
  clear(): void
}

type Row = { thread_id: string; id: string; text: string; uncertain: number; position: number }

export function createOutboxStore(database: OutboxDatabase): OutboxStore {
  return {
    load() {
      const rows = database.getAllSync<Row>(
        'SELECT thread_id, id, text, uncertain, position FROM outbox_message ORDER BY thread_id, position',
        [],
      )
      const pauses = database.getAllSync<{ thread_id: string; paused: number }>(
        'SELECT thread_id, paused FROM outbox_state',
        [],
      )
      const pausedByThread = new Map(pauses.map((row) => [row.thread_id, row.paused === 1]))
      const byThread = new Map<string, QueuedMessage[]>()
      for (const row of rows) {
        const items = byThread.get(row.thread_id) ?? []
        items.push({ id: row.id, text: row.text, ...(row.uncertain ? { uncertain: true } : {}) })
        byThread.set(row.thread_id, items)
      }
      const threads = new Set([...byThread.keys(), ...pausedByThread.keys()])
      return [...threads]
        .map((threadId) => ({
          threadId,
          items: byThread.get(threadId) ?? [],
          paused: pausedByThread.get(threadId) ?? false,
        }))
        .filter((entry) => entry.items.length > 0 || entry.paused)
    },
    save(threadId, items, paused) {
      // One transaction: a restart sees either the old queue or the complete new
      // one, never a deleted or half-written queue whose drafts are already gone.
      database.withTransactionSync(() => {
        database.runSync('DELETE FROM outbox_message WHERE thread_id = ?', [threadId])
        items.forEach((item, position) => {
          database.runSync(
            'INSERT INTO outbox_message (thread_id, id, text, uncertain, position, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [threadId, item.id, item.text, item.uncertain ? 1 : 0, position, Date.now()],
          )
        })
        if (items.length || paused)
          database.runSync(
            'INSERT OR REPLACE INTO outbox_state (thread_id, paused, updated_at) VALUES (?, ?, ?)',
            [threadId, paused ? 1 : 0, Date.now()],
          )
        else database.runSync('DELETE FROM outbox_state WHERE thread_id = ?', [threadId])
      })
    },
    clear() {
      database.withTransactionSync(() => {
        database.runSync('DELETE FROM outbox_message', [])
        database.runSync('DELETE FROM outbox_state', [])
      })
    },
  }
}
