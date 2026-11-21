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
CREATE TABLE IF NOT EXISTS intake_delivery (
  id TEXT PRIMARY KEY NOT NULL,
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox_message (
  thread_id TEXT NOT NULL,
  id TEXT NOT NULL,
  text TEXT NOT NULL,
  uncertain INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (thread_id, id)
);
CREATE TABLE IF NOT EXISTS outbox_state (
  thread_id TEXT PRIMARY KEY NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`
