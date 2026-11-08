// SOURCING: SQLite DDL for the on-device database (local-db.ts); kept apart from expo-sqlite so tests run it against bun:sqlite

export const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS conversation_journal (
  key TEXT PRIMARY KEY NOT NULL,
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS draft (
  key TEXT PRIMARY KEY NOT NULL,
  text TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`
