// SOURCING: bun:test; bun:sqlite runs the app's own DDL (local-schema.ts) behind the expo-sqlite subset the store uses
import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import type { ConversationIdentity, ConversationJournal } from '@theoremharness/sdk'
import { createJournalStore, journalKey, type JournalDatabase } from './journal-store'
import { SCHEMA } from './local-schema'

function database(): JournalDatabase & { rows: () => number } {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA.replace('PRAGMA journal_mode = WAL;', ''))
  return {
    async getFirstAsync<T>(sql: string, params: string[]) {
      return (sqlite.query(sql).get(...params) as T | undefined) ?? null
    },
    async runAsync(sql: string, params: (string | number)[]) {
      return sqlite.query(sql).run(...params)
    },
    rows: () => (sqlite.query('SELECT COUNT(*) AS n FROM conversation_journal').get() as { n: number }).n,
  }
}

const identity: ConversationIdentity = {
  authority: 'https://theorem.example',
  tenantId: 'tenant-a',
  principalId: 'person-a',
  threadId: 'thread-1',
} as ConversationIdentity

const journal = (overrides: Partial<ConversationJournal> = {}): ConversationJournal => ({
  schema: 'theorem-sdk-conversation/1',
  identity,
  pending: [],
  events: [],
  ...overrides,
})

describe('journal store', () => {
  test('saves and loads by identity, replacing in place', async () => {
    const db = database()
    const store = createJournalStore(db)
    expect(await store.load(identity)).toBeUndefined()
    await store.save(journal({ runId: 'run-1' }))
    await store.save(journal({ runId: 'run-2' }))
    expect((await store.load(identity))?.runId).toBe('run-2')
    expect(db.rows()).toBe(1)
  })

  test('another principal, tenant or authority never loads this journal', async () => {
    const store = createJournalStore(database())
    await store.save(journal({ runId: 'run-1' }))
    for (const field of ['authority', 'tenantId', 'principalId', 'threadId'] as const)
      expect(await store.load({ ...identity, [field]: 'other' })).toBeUndefined()
  })

  test('refuses a journal carrying a credential', async () => {
    const db = database()
    const store = createJournalStore(db)
    const leaking = journal({
      pending: [{ headers: { Authorization: 'Bearer secret' } }] as unknown as ConversationJournal['pending'],
    })
    await expect(store.save(leaking)).rejects.toThrow(/credentials/)
    expect(db.rows()).toBe(0)
  })

  test('the key covers every identity field', () => {
    expect(JSON.parse(journalKey(identity))).toEqual([
      'https://theorem.example',
      'tenant-a',
      'person-a',
      'thread-1',
    ])
  })
})
