// SOURCING: bun:sqlite with SQLite's FTS5 (full-text search, bm25 ranking and
// snippet()). The schema is this app's: the entries a workspace holds and what
// parseNote() found in each Markdown file. Everything here is derived from the
// folder and can be rebuilt from it.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import type {
  SearchHit,
  WorkspaceEntry,
  WorkspaceLink,
} from '#/lib/workspace/types'
import type { ParsedNote } from './markdown'
import { nameKey, resolveLink } from './resolve'
import type { LinkLookup } from './resolve'

/** An entry as the index keeps it. Directories have no hashes. */
export interface IndexedEntry extends WorkspaceEntry {
  /** SHA-256 of the bytes. */
  hash: string | null
  /** The hash with line endings normalized, which decides whether a file changed. */
  normHash: string | null
}

// Bump to drop and rebuild every index on its next open.
const SCHEMA_VERSION = 1

const SCHEMA = `
CREATE TABLE entries (
  path TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime_ms REAL NOT NULL,
  hash TEXT,
  norm_hash TEXT,
  name_key TEXT NOT NULL
);
CREATE INDEX entries_name_key ON entries (name_key);
CREATE TABLE notes (path TEXT PRIMARY KEY, title TEXT NOT NULL);
CREATE TABLE links (
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  syntax TEXT NOT NULL,
  target TEXT NOT NULL,
  target_key TEXT NOT NULL,
  heading TEXT,
  block TEXT,
  line INTEGER NOT NULL
);
CREATE INDEX links_source ON links (source);
CREATE INDEX links_target_key ON links (target_key);
CREATE TABLE headings (path TEXT NOT NULL, depth INTEGER NOT NULL, text TEXT NOT NULL, line INTEGER NOT NULL);
CREATE INDEX headings_path ON headings (path);
CREATE TABLE tags (path TEXT NOT NULL, tag TEXT NOT NULL, source TEXT NOT NULL, line INTEGER NOT NULL);
CREATE INDEX tags_path ON tags (path);
CREATE INDEX tags_tag ON tags (tag COLLATE NOCASE);
CREATE TABLE properties (path TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL);
CREATE INDEX properties_path ON properties (path);
CREATE TABLE tasks (path TEXT NOT NULL, text TEXT NOT NULL, checked INTEGER NOT NULL, line INTEGER NOT NULL);
CREATE INDEX tasks_path ON tasks (path);
CREATE TABLE blocks (path TEXT NOT NULL, block_id TEXT NOT NULL, line INTEGER NOT NULL);
CREATE INDEX blocks_path ON blocks (path);
CREATE VIRTUAL TABLE fts USING fts5 (path UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2');
`

/** Tables holding what was parsed out of a note, each with a `path` column. */
const NOTE_TABLES = [
  'notes',
  'headings',
  'tags',
  'properties',
  'tasks',
  'blocks',
  'fts',
] as const

interface EntryRow {
  path: string
  id: string
  kind: 'file' | 'directory'
  size: number
  mtime_ms: number
  hash: string | null
  norm_hash: string | null
}

interface LinkRow {
  source: string
  kind: WorkspaceLink['kind']
  syntax: 'wiki' | 'markdown'
  target: string
  heading: string | null
  block: string | null
  line: number
}

const toEntry = (row: EntryRow): IndexedEntry => ({
  id: row.id,
  path: row.path,
  kind: row.kind,
  size: row.size,
  mtimeMs: row.mtime_ms,
  hash: row.hash,
  normHash: row.norm_hash,
})

/** A note's title: its `title` property, else its first heading, else its name. */
export function noteTitle(entryPath: string, note: ParsedNote): string {
  const property = note.properties.title
  if (typeof property === 'string' && property.trim()) return property.trim()
  const heading = note.headings.find((h) => h.depth === 1) ?? note.headings[0]
  if (heading?.text) return heading.text
  return path.posix.basename(entryPath).replace(/\.md$/i, '')
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  )

/**
 * What a person typed, split as Obsidian's search splits it: `tag:#name`
 * terms (the `#` is optional) and the words to find in titles and bodies.
 */
export function parseSearch(input: string): {
  tags: Array<string>
  words: Array<string>
} {
  const tags: Array<string> = []
  const words: Array<string> = []
  for (const term of input.split(/\s+/).filter(Boolean)) {
    const tag = /^tag:#?(.+)$/i.exec(term)?.[1]?.replace(/\/+$/, '')
    if (tag) tags.push(tag)
    else words.push(term)
  }
  return { tags, words }
}

/** LIKE's wildcards in `text`, escaped with `\`. */
const likeLiteral = (text: string) => text.replace(/[\\%_]/g, '\\$&')

/**
 * The FTS5 query for what a person typed: every word must appear, the last as
 * a prefix so results follow typing. Words are quoted so FTS5 operators and
 * punctuation in them are taken literally.
 */
export function ftsQuery(input: string): string | null {
  const words = input.split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  return words
    .map((word, i) => {
      const quoted = `"${word.replace(/"/g, '""')}"`
      return i === words.length - 1 ? `${quoted}*` : quoted
    })
    .join(' ')
}

/** One workspace's index at `desktopDataDir()/workspaces/<id>/index.sqlite`. */
export class WorkspaceIndex implements LinkLookup {
  private constructor(readonly db: Database) {}

  static open(file: string): WorkspaceIndex {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true })
    const db = new Database(file, { create: true, strict: true })
    db.run('PRAGMA journal_mode = WAL')
    const { user_version } = db.query('PRAGMA user_version').get() as {
      user_version: number
    }
    if (user_version !== SCHEMA_VERSION) {
      const tables = db
        .query(
          "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%'",
        )
        .all() as Array<{ name: string }>
      for (const { name } of tables) db.run(`DROP TABLE IF EXISTS "${name}"`)
      db.run(SCHEMA)
      db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    }
    return new WorkspaceIndex(db)
  }

  close(): void {
    this.db.close()
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }

  /** Empties the index, for a rebuild from the folder. */
  clear(): void {
    this.transaction(() => {
      this.db.run('DELETE FROM entries')
      this.db.run('DELETE FROM links')
      for (const table of NOTE_TABLES) this.db.run(`DELETE FROM ${table}`)
    })
  }

  entries(): Array<IndexedEntry> {
    return (
      this.db
        .query('SELECT * FROM entries ORDER BY path')
        .all() as Array<EntryRow>
    ).map(toEntry)
  }

  entry(entryPath: string): IndexedEntry | undefined {
    const row = this.db
      .query('SELECT * FROM entries WHERE path = $path')
      .get({ path: entryPath }) as EntryRow | null
    return row ? toEntry(row) : undefined
  }

  /** The entry and everything below it, deepest last. */
  subtree(entryPath: string): Array<IndexedEntry> {
    return (
      this.db
        .query(
          'SELECT * FROM entries WHERE path = $path OR substr(path, 1, length($prefix)) = $prefix ORDER BY path',
        )
        .all({ path: entryPath, prefix: `${entryPath}/` }) as Array<EntryRow>
    ).map(toEntry)
  }

  putEntry(entry: IndexedEntry): void {
    this.db
      .query(
        `INSERT INTO entries (path, id, kind, size, mtime_ms, hash, norm_hash, name_key)
         VALUES ($path, $id, $kind, $size, $mtime, $hash, $norm, $key)
         ON CONFLICT (path) DO UPDATE SET id = $id, kind = $kind, size = $size,
           mtime_ms = $mtime, hash = $hash, norm_hash = $norm, name_key = $key`,
      )
      .run({
        path: entry.path,
        id: entry.id,
        kind: entry.kind,
        size: entry.size,
        mtime: entry.mtimeMs,
        hash: entry.hash,
        norm: entry.normHash,
        key: nameKey(entry.path),
      })
  }

  /** Removes the entry and what was parsed from it. */
  removeEntry(entryPath: string): void {
    this.db.query('DELETE FROM entries WHERE path = $path').run({
      path: entryPath,
    })
    this.clearNote(entryPath)
  }

  /** Moves the entry and its parsed rows to a new path. */
  moveEntry(from: string, to: string): void {
    this.db
      .query(
        'UPDATE entries SET path = $to, name_key = $key WHERE path = $from',
      )
      .run({ from, to, key: nameKey(to) })
    this.db
      .query('UPDATE links SET source = $to WHERE source = $from')
      .run({ from, to })
    for (const table of NOTE_TABLES)
      this.db
        .query(`UPDATE ${table} SET path = $to WHERE path = $from`)
        .run({ from, to })
  }

  clearNote(entryPath: string): void {
    this.db
      .query('DELETE FROM links WHERE source = $path')
      .run({ path: entryPath })
    for (const table of NOTE_TABLES)
      this.db
        .query(`DELETE FROM ${table} WHERE path = $path`)
        .run({ path: entryPath })
  }

  /** Replaces what the index holds about a Markdown file. */
  putNote(entryPath: string, note: ParsedNote): void {
    this.clearNote(entryPath)
    const p = entryPath
    this.db
      .query('INSERT INTO notes (path, title) VALUES ($p, $title)')
      .run({ p, title: noteTitle(entryPath, note) })
    const link = this.db.query(
      `INSERT INTO links (source, kind, syntax, target, target_key, heading, block, line)
       VALUES ($p, $kind, $syntax, $target, $key, $heading, $block, $line)`,
    )
    for (const l of note.links)
      link.run({
        p,
        kind: l.kind,
        syntax: l.syntax,
        target: l.target,
        key: nameKey(l.target),
        heading: l.heading ?? null,
        block: l.block ?? null,
        line: l.line,
      })
    const heading = this.db.query(
      'INSERT INTO headings (path, depth, text, line) VALUES ($p, $depth, $text, $line)',
    )
    for (const h of note.headings) heading.run({ p, ...h })
    const tag = this.db.query(
      'INSERT INTO tags (path, tag, source, line) VALUES ($p, $tag, $source, $line)',
    )
    for (const t of note.tags) tag.run({ p, ...t })
    const property = this.db.query(
      'INSERT INTO properties (path, key, value) VALUES ($p, $key, $value)',
    )
    for (const [key, value] of Object.entries(note.properties))
      property.run({ p, key, value: JSON.stringify(value) })
    const task = this.db.query(
      'INSERT INTO tasks (path, text, checked, line) VALUES ($p, $text, $checked, $line)',
    )
    for (const t of note.tasks)
      task.run({ p, text: t.text, checked: t.checked ? 1 : 0, line: t.line })
    const block = this.db.query(
      'INSERT INTO blocks (path, block_id, line) VALUES ($p, $id, $line)',
    )
    for (const b of note.blocks) block.run({ p, ...b })
    this.db
      .query('INSERT INTO fts (path, title, body) VALUES ($p, $title, $body)')
      .run({ p, title: noteTitle(entryPath, note), body: note.body })
  }

  /** LinkLookup: the files whose name key is `key`. */
  named(key: string): Array<string> {
    return (
      this.db
        .query(
          "SELECT path FROM entries WHERE name_key = $key AND kind = 'file'",
        )
        .all({ key }) as Array<{ path: string }>
    ).map((row) => row.path)
  }

  /** Notes holding a link whose target could name a file with one of these keys. */
  sourcesFor(keys: Iterable<string>): Array<string> {
    const query = this.db.query(
      'SELECT DISTINCT source FROM links WHERE target_key = $key',
    )
    const sources = new Set<string>()
    for (const key of keys)
      for (const row of query.all({ key }) as Array<{ source: string }>)
        sources.add(row.source)
    return [...sources].sort()
  }

  private toLink(row: LinkRow): WorkspaceLink {
    return {
      from: row.source,
      target: row.target,
      resolved: resolveLink(row.target, row.source, row.syntax, this),
      kind: row.kind,
      ...(row.heading !== null && { heading: row.heading }),
      ...(row.block !== null && { block: row.block }),
      line: row.line,
    }
  }

  /** The links in a note, in order, each resolved against the workspace now. */
  links(entryPath: string): Array<WorkspaceLink> {
    return (
      this.db
        .query('SELECT * FROM links WHERE source = $path ORDER BY rowid')
        .all({ path: entryPath }) as Array<LinkRow>
    ).map((row) => this.toLink(row))
  }

  /** The links anywhere in the workspace that resolve to `entryPath`. */
  backlinks(entryPath: string): Array<WorkspaceLink> {
    return (
      this.db
        .query(
          'SELECT * FROM links WHERE target_key = $key ORDER BY source, rowid',
        )
        .all({ key: nameKey(entryPath) }) as Array<LinkRow>
    )
      .map((row) => this.toLink(row))
      .filter((link) => link.resolved === entryPath)
  }

  /**
   * Full-text search over titles and bodies, best match first. A `tag:#name`
   * term keeps the notes with that tag or one nested under it (`#name/sub`),
   * as Obsidian's does; with only tags, the notes come by title.
   */
  search(input: string, limit = 20): Array<SearchHit> {
    const { tags, words } = parseSearch(input)
    const match = ftsQuery(words.join(' '))
    if (!match && tags.length === 0) return []
    const params: Record<string, string | number> = { limit }
    const tagged = tags.map((tag, i) => {
      params[`tag${i}`] = tag
      params[`nested${i}`] = `${likeLiteral(tag)}/%`
      return `notes.path IN (SELECT path FROM tags WHERE tag = $tag${i} COLLATE NOCASE OR tag LIKE $nested${i} ESCAPE '\\')`
    })
    if (!match) {
      const rows = this.db
        .query(
          `SELECT path, title FROM notes WHERE ${tagged.join(' AND ')}
           ORDER BY title COLLATE NOCASE LIMIT $limit`,
        )
        .all(params) as Array<{ path: string; title: string }>
      return rows.map((row) => ({ ...row, snippet: '', score: 0 }))
    }
    params.match = match
    const rows = this.db
      .query(
        `SELECT fts.path AS path, notes.title AS title,
           snippet(fts, -1, char(2), char(3), '…', 16) AS snippet,
           bm25(fts, 0, 5.0, 1.0) AS rank
         FROM fts JOIN notes ON notes.path = fts.path
         WHERE fts MATCH $match ${tagged.map((t) => `AND ${t}`).join(' ')}
         ORDER BY rank LIMIT $limit`,
      )
      .all(params) as Array<{
      path: string
      title: string
      snippet: string
      rank: number
    }>
    return rows.map((row) => ({
      path: row.path,
      title: row.title,
      snippet: escapeHtml(row.snippet)
        .replaceAll('\u0002', '<mark>')
        .replaceAll('\u0003', '</mark>'),
      score: -row.rank,
    }))
  }

  /** Every tag with the number of notes using it, case-insensitively grouped. */
  tags(): Array<{ tag: string; count: number }> {
    return this.db
      .query(
        `SELECT MIN(tag) AS tag, COUNT(DISTINCT path) AS count FROM tags
         GROUP BY tag COLLATE NOCASE ORDER BY tag COLLATE NOCASE`,
      )
      .all() as Array<{ tag: string; count: number }>
  }

  properties(entryPath: string): Record<string, unknown> {
    const rows = this.db
      .query(
        'SELECT key, value FROM properties WHERE path = $path ORDER BY rowid',
      )
      .all({ path: entryPath }) as Array<{ key: string; value: string }>
    return Object.fromEntries(
      rows.map((row) => [row.key, JSON.parse(row.value) as unknown]),
    )
  }
}
