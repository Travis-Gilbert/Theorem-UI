// SOURCING: expo-sqlite (openDatabaseSync, runAsync, getFirstAsync; one autocommit statement per write is SQLite's atomic replace)
//
// One on-device database holds what must survive termination: conversation
// journals (the SDK's durable command and event log), composer drafts and
// browser tabs. Tokens never go here; they live in the Keychain (auth.ts).
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite'
import { SCHEMA } from './local-schema'

let database: SQLiteDatabase | undefined

export function db(): SQLiteDatabase {
  if (!database) {
    database = openDatabaseSync('theorem.db')
    database.execSync(SCHEMA)
  }
  return database
}

/** Small preferences and device-local state. */
export const kv = {
  get(key: string): string | undefined {
    return (
      db().getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key])?.value ?? undefined
    )
  },
  set(key: string, value: string): void {
    db().runSync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, value])
  },
  delete(key: string): void {
    db().runSync('DELETE FROM kv WHERE key = ?', [key])
  },
}

/** Removes everything this account left on the device, for sign-out. */
export function clearAccountData(): void {
  db().execSync('DELETE FROM conversation_journal; DELETE FROM draft; DELETE FROM intake_delivery;')
}
