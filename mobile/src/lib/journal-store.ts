// SOURCING: @theoremharness/sdk ConversationStore contract (headless.ts): load by identity, atomic replace on save, never a token; the SDK's own parseJson/stringifyJson (lossless-json), because the SDK parses wire integers above 2^53 as bigint and plain JSON cannot write them
import {
  parseJson,
  stringifyJson,
  type ConversationIdentity,
  type ConversationJournal,
  type ConversationStore,
} from '@theoremharness/sdk'

/** The subset of expo-sqlite the store uses, so tests can supply their own. */
export type JournalDatabase = {
  getFirstAsync<T>(sql: string, params: string[]): Promise<T | null>
  runAsync(sql: string, params: (string | number)[]): Promise<unknown>
}

/** Every identity field is part of the key: another account's journal never loads. */
export const journalKey = (identity: ConversationIdentity) =>
  JSON.stringify([identity.authority, identity.tenantId, identity.principalId, identity.threadId])

/** Header names the SDK strips before journaling; a journal holding one is refused. */
const CREDENTIAL_KEYS = /"(authorization|cookie|x-csrf-token|access_token|refresh_token)"\s*:/i

export function createJournalStore(database: JournalDatabase): ConversationStore {
  return {
    async load(identity) {
      const row = await database.getFirstAsync<{ body: string }>(
        'SELECT body FROM conversation_journal WHERE key = ?',
        [journalKey(identity)],
      )
      return row ? (parseJson(row.body) as ConversationJournal) : undefined
    },
    async save(journal) {
      const body = stringifyJson(journal) as string
      if (CREDENTIAL_KEYS.test(body))
        throw new Error('Refusing to persist a conversation journal that carries credentials')
      // One statement replaces the row atomically; the promise resolves after commit.
      await database.runAsync(
        'INSERT OR REPLACE INTO conversation_journal (key, body, updated_at) VALUES (?, ?, ?)',
        [journalKey(journal.identity), body, Date.now()],
      )
    },
  }
}
