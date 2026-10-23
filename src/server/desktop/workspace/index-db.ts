// SOURCING: @rustyred/node, the Node-API binding of Rusty Red: an embedded
// graph database in one file, with a BM25 full-text index (ranking, prefix
// matching and marked snippets) kept in the same file. The graph is this app's:
// the entries a workspace holds and what parseNote() found in each Markdown
// file. Everything here is derived from the folder and can be rebuilt from it.
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import type * as RustyRed from '@rustyred/node'
import type {
  Database,
  Edge,
  Node as GraphNode,
  NodeFilter,
} from '@rustyred/node'
import type {
  SearchHit,
  WorkspaceEntry,
  WorkspaceLink,
} from '#/lib/workspace/types'
import type { ParsedLink, ParsedNote } from './markdown'
import { nameKey, resolveLink } from './resolve'
import type { LinkLookup } from './resolve'

/** An entry as the index keeps it. Directories have no hashes. */
export interface IndexedEntry extends WorkspaceEntry {
  /** SHA-256 of the bytes. */
  hash: string | null
  /** The hash with line endings normalized, which decides whether a file changed. */
  normHash: string | null
}

/*
 * The graph, one node for each thing a lookup starts from:
 *
 * - `entry:<path>` (Entry): a file or folder, with its id, size, time, hashes
 *   and the name key links to it share.
 * - `note:<path>` (Note): what parseNote() found in a Markdown file. Its title
 *   and body are in the full-text index.
 * - `tag:<key>` (Tag) and `linkkey:<key>` (LinkKey): a tag lowercased, and a
 *   name key. A note has a TAGGED edge to each of its tags, holding the
 *   smallest spelling it uses, and a LINKS_TO edge to the key of each of its
 *   links. A tag or key is deleted with its last edge.
 * - `meta` (Meta): the schema version.
 */

// Bump to drop and rebuild every index on its next open.
const SCHEMA_VERSION = 1

const ENTRY = 'entry:'
const NOTE = 'note:'
const TAG = 'tag:'
const LINK_KEY = 'linkkey:'
const META = 'meta'

// The index is derived data: no ControlEvent per write and no history, so
// compaction keeps the file near the size of what it holds.
const OPTIONS = { controlEvents: false, keepHistory: false }

// A title match weighs five times a body match.
const FULLTEXT = { title: 5, body: 1 }

// The file is compacted when it has doubled since the last compaction, and
// not below this size.
const COMPACT_FLOOR = 1 << 20

type Binding = typeof RustyRed

// Picked into an object type, which can stand as a node's properties.
type EntryProperties = Pick<IndexedEntry, keyof IndexedEntry> & {
  nameKey: string
}

type NoteProperties = {
  path: string
  title: string
  body: string
  links: Array<ParsedLink>
  headings: ParsedNote['headings']
  tags: ParsedNote['tags']
  /** The frontmatter's `[key, value]` pairs as JSON, in the order written. */
  frontmatter: string
  tasks: ParsedNote['tasks']
  blocks: ParsedNote['blocks']
}

/** Writes not yet committed, by id; `null` deletes. */
interface Pending {
  nodes: Map<string, GraphNode | null>
  edges: Map<string, Edge | null>
  /** Tags and keys that lost an edge, and may have none left. */
  ends: Set<string>
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** By the UTF-8 bytes of the path, the order the database keeps them in. */
const byPath = (a: IndexedEntry, b: IndexedEntry) =>
  Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))

/** The value as JSON holds it: no `undefined` members, dates as strings. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const tagKey = (tag: string) => tag.toLowerCase()

function entryNode(entry: IndexedEntry): GraphNode {
  const properties: EntryProperties = {
    id: entry.id,
    path: entry.path,
    kind: entry.kind,
    size: entry.size,
    mtimeMs: entry.mtimeMs,
    hash: entry.hash,
    normHash: entry.normHash,
    nameKey: nameKey(entry.path),
  }
  return { id: ENTRY + entry.path, labels: ['Entry'], properties }
}

function toEntry(node: GraphNode): IndexedEntry {
  const p = node.properties as EntryProperties
  return {
    id: p.id,
    path: p.path,
    kind: p.kind,
    size: p.size,
    mtimeMs: p.mtimeMs,
    hash: p.hash,
    normHash: p.normHash,
  }
}

/** A note's title: its `title` property, else its first heading, else its name. */
export function noteTitle(
  entryPath: string,
  note: Pick<ParsedNote, 'properties' | 'headings'>,
): string {
  const property = note.properties.title
  if (typeof property === 'string' && property.trim()) return property.trim()
  const heading = note.headings.find((h) => h.depth === 1) ?? note.headings[0]
  if (heading?.text) return heading.text
  return path.posix.basename(entryPath).replace(/\.md$/i, '')
}

const frontmatter = (note: NoteProperties) =>
  Object.fromEntries(
    JSON.parse(note.frontmatter) as Array<[string, unknown]>,
  ) as Record<string, unknown>

/** The edges a note has, each with the tag or key node it reaches. */
function noteEdges(
  note: NoteProperties,
): Array<{ edge: Edge; end: GraphNode }> {
  const from = NOTE + note.path
  const edges = new Map<string, { edge: Edge; end: GraphNode }>()
  const add = (
    type: string,
    label: string,
    to: string,
    key: string,
    properties: Record<string, unknown>,
  ) => {
    const id = JSON.stringify([type, from, to])
    edges.set(id, {
      edge: { id, from, to, type, properties },
      end: { id: to, labels: [label], properties: { key } },
    })
  }
  for (const { tag } of note.tags) {
    const key = tagKey(tag)
    const seen = edges.get(JSON.stringify(['TAGGED', from, TAG + key]))
    if (!seen || tag < (seen.edge.properties.tag as string))
      add('TAGGED', 'Tag', TAG + key, key, { tag })
  }
  for (const link of note.links) {
    const key = nameKey(link.target)
    add('LINKS_TO', 'LinkKey', LINK_KEY + key, key, {})
  }
  return [...edges.values()]
}

/** The graph one workspace's index needs, as a new file holds it. */
function prepared(db: Database): Database {
  db.designateFulltext('Note', FULLTEXT)
  db.mutate({
    upsertNodes: [
      { id: META, labels: ['Meta'], properties: { schema: SCHEMA_VERSION } },
    ],
  })
  return db
}

/**
 * The index file at `file`, created if it is missing and recreated if an
 * earlier schema wrote it.
 */
function connect(binding: Binding, file: string): Database {
  mkdirSync(path.dirname(file), { recursive: true })
  if (existsSync(file)) {
    const db = binding.Database.open(file, OPTIONS)
    if (db.getNode(META)?.properties.schema === SCHEMA_VERSION) return db
    db.close()
    rmSync(file)
  }
  return prepared(binding.Database.create(file, OPTIONS))
}

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

/** One workspace's index at `desktopDataDir()/workspaces/<id>/index.rr`. */
export class WorkspaceIndex implements LinkLookup {
  private pending: Pending | null = null
  /** The file's size after its last compaction. */
  private compacted = 0

  private constructor(
    private readonly binding: Binding,
    private readonly file: string,
    private db: Database,
  ) {}

  static async open(file: string): Promise<WorkspaceIndex> {
    // Loaded on first use, so a server that never opens a workspace (the web
    // deployment) never loads the native addon.
    const binding = await import('@rustyred/node')
    const index = new WorkspaceIndex(binding, file, connect(binding, file))
    index.compact()
    return index
  }

  close(): void {
    this.db.close()
  }

  /**
   * Runs `fn` as one commit. Inside it, entry and note reads see its writes;
   * link-key lookups, tags and search see the last commit. A throw discards
   * the writes.
   */
  transaction<T>(fn: () => T): T {
    if (this.pending) return fn()
    this.pending = { nodes: new Map(), edges: new Map(), ends: new Set() }
    try {
      const result = fn()
      this.commit(this.pending)
      return result
    } finally {
      this.pending = null
    }
  }

  /** Empties the index, for a rebuild from the folder. */
  clear(): void {
    this.db.close()
    rmSync(this.file)
    this.db = prepared(this.binding.Database.create(this.file, OPTIONS))
    this.compacted = statSync(this.file).size
  }

  entries(): Array<IndexedEntry> {
    return this.findEntries(
      { prefix: { property: 'path', value: '' } },
      () => true,
    )
  }

  entry(entryPath: string): IndexedEntry | undefined {
    const node = this.node(ENTRY + entryPath)
    return node ? toEntry(node) : undefined
  }

  /** The entry and everything below it, deepest last. */
  subtree(entryPath: string): Array<IndexedEntry> {
    const prefix = `${entryPath}/`
    const below = this.findEntries(
      { prefix: { property: 'path', value: prefix } },
      (entry) => entry.path.startsWith(prefix),
    )
    const entry = this.entry(entryPath)
    return entry ? [entry, ...below] : below
  }

  putEntry(entry: IndexedEntry): void {
    this.write((pending) =>
      pending.nodes.set(ENTRY + entry.path, entryNode(entry)),
    )
  }

  /** Removes the entry and what was parsed from it. */
  removeEntry(entryPath: string): void {
    this.write((pending) => {
      pending.nodes.set(ENTRY + entryPath, null)
      this.clearNote(entryPath)
    })
  }

  /** Moves the entry and what was parsed from it to a new path. */
  moveEntry(from: string, to: string): void {
    this.write((pending) => {
      const entry = this.entry(from)
      if (entry) {
        pending.nodes.set(ENTRY + from, null)
        pending.nodes.set(ENTRY + to, entryNode({ ...entry, path: to }))
      }
      const note = this.note(from)
      if (!note) return
      this.clearNote(from)
      // The title may be the note's name.
      const properties = frontmatter(note)
      this.setNote({
        ...note,
        path: to,
        title: noteTitle(to, { properties, headings: note.headings }),
      })
    })
  }

  clearNote(entryPath: string): void {
    this.write((pending) => {
      const note = this.note(entryPath)
      if (!note) return
      for (const { edge } of noteEdges(note)) {
        pending.edges.set(edge.id, null)
        pending.ends.add(edge.to)
      }
      pending.nodes.set(NOTE + entryPath, null)
    })
  }

  /** Replaces what the index holds about a Markdown file. */
  putNote(entryPath: string, note: ParsedNote): void {
    this.write(() => {
      this.clearNote(entryPath)
      this.setNote(
        plain({
          path: entryPath,
          title: noteTitle(entryPath, note),
          body: note.body,
          links: note.links,
          headings: note.headings,
          tags: note.tags,
          frontmatter: JSON.stringify(Object.entries(note.properties)),
          tasks: note.tasks,
          blocks: note.blocks,
        }),
      )
    })
  }

  /** LinkLookup: the files whose name key is `key`. */
  named(key: string): Array<string> {
    return this.findEntries(
      { properties: { nameKey: key, kind: 'file' } },
      (entry) => entry.nameKey === key && entry.kind === 'file',
    ).map((entry) => entry.path)
  }

  /** Notes holding a link whose target could name a file with one of these keys. */
  sourcesFor(keys: Iterable<string>): Array<string> {
    const sources = new Set<string>()
    for (const key of keys)
      for (const hit of this.db.neighbors({
        nodeId: LINK_KEY + key,
        direction: 'in',
        edgeType: 'LINKS_TO',
      }))
        sources.add(hit.nodeId.slice(NOTE.length))
    return [...sources].sort()
  }

  /** The links in a note, in order, each resolved against the workspace now. */
  links(entryPath: string): Array<WorkspaceLink> {
    return (this.note(entryPath)?.links ?? []).map((link) =>
      this.toLink(entryPath, link),
    )
  }

  /** The links anywhere in the workspace that resolve to `entryPath`. */
  backlinks(entryPath: string): Array<WorkspaceLink> {
    const key = nameKey(entryPath)
    return this.sourcesFor([key])
      .flatMap((source) =>
        (this.note(source)?.links ?? [])
          .filter((link) => nameKey(link.target) === key)
          .map((link) => this.toLink(source, link)),
      )
      .filter((link) => link.resolved === entryPath)
  }

  /**
   * Full-text search over titles and bodies, best match first. Every word
   * must match, the last also as the start of a longer word, so results
   * follow typing. A `tag:#name` term keeps the notes with that tag or one
   * nested under it (`#name/sub`), as Obsidian's does; with only tags, the
   * notes come by title.
   */
  search(input: string, limit = 20): Array<SearchHit> {
    const { tags, words } = parseSearch(input)
    if (words.length === 0 && tags.length === 0) return []
    let within: Array<string> | undefined
    for (const tag of tags) {
      const tagged = this.tagged(tag)
      within = (within ?? [...tagged]).filter((id) => tagged.has(id))
    }
    if (words.length === 0)
      return (within ?? [])
        .flatMap((id) => {
          const note = this.note(id.slice(NOTE.length))
          return note ? [{ path: note.path, title: note.title }] : []
        })
        .sort(
          (a, b) =>
            compare(a.title.toLowerCase(), b.title.toLowerCase()) ||
            compare(a.path, b.path),
        )
        .slice(0, limit)
        .map((hit) => ({ ...hit, snippet: '', score: 0 }))
    return this.db
      .fulltextSearch('Note', words.join(' '), limit, within)
      .flatMap((hit) => {
        const note = this.note(hit.id.slice(NOTE.length))
        return note
          ? [
              {
                path: note.path,
                title: note.title,
                snippet: hit.snippet,
                score: hit.score,
              },
            ]
          : []
      })
  }

  /** Every tag with the number of notes using it, case-insensitively grouped. */
  tags(): Array<{ tag: string; count: number }> {
    return this.db
      .queryNodes({ label: 'Tag' })
      .flatMap((node) => {
        const spellings = this.db
          .neighbors({ nodeId: node.id, direction: 'in', edgeType: 'TAGGED' })
          .map((hit) => hit.properties.tag as string)
          .sort()
        return spellings.length > 0
          ? [{ tag: spellings[0]!, count: spellings.length }]
          : []
      })
      .sort((a, b) => compare(a.tag.toLowerCase(), b.tag.toLowerCase()))
  }

  properties(entryPath: string): Record<string, unknown> {
    const note = this.note(entryPath)
    return note ? frontmatter(note) : {}
  }

  // Internals --------------------------------------------------------------

  /** Runs `fn` with this transaction's writes, or as a commit of its own. */
  private write(fn: (pending: Pending) => void): void {
    this.transaction(() => fn(this.pending!))
  }

  /** A node as this transaction leaves it, or as last committed. */
  private node(id: string): GraphNode | null {
    const pending = this.pending?.nodes.get(id)
    return pending === undefined ? this.db.getNode(id) : pending
  }

  private note(entryPath: string): NoteProperties | null {
    const node = this.node(NOTE + entryPath)
    return node ? (node.properties as NoteProperties) : null
  }

  /** Writes a note and its edges, creating the tags and keys they reach. */
  private setNote(note: NoteProperties): void {
    const pending = this.pending!
    const id = NOTE + note.path
    pending.nodes.set(id, { id, labels: ['Note'], properties: note })
    for (const { edge, end } of noteEdges(note)) {
      pending.edges.set(edge.id, edge)
      if (!this.node(end.id)) pending.nodes.set(end.id, end)
    }
  }

  /**
   * The entries `filter` finds, with this transaction's writes applied:
   * `matches` says whether an entry it wrote belongs in the result.
   */
  private findEntries(
    filter: NodeFilter,
    matches: (entry: EntryProperties) => boolean,
  ): Array<IndexedEntry> {
    const found = this.db.queryNodes({ label: 'Entry', ...filter })
    const written = [...(this.pending?.nodes ?? [])].filter(([id]) =>
      id.startsWith(ENTRY),
    )
    if (written.length === 0) return found.map(toEntry)
    const byId = new Map(found.map((node) => [node.id, node]))
    for (const [id, node] of written)
      if (node && matches(node.properties as EntryProperties))
        byId.set(id, node)
      else byId.delete(id)
    return [...byId.values()].map(toEntry).sort(byPath)
  }

  private toLink(source: string, link: ParsedLink): WorkspaceLink {
    return {
      from: source,
      target: link.target,
      resolved: resolveLink(link.target, source, link.syntax, this),
      kind: link.kind,
      ...(link.heading !== undefined && { heading: link.heading }),
      ...(link.block !== undefined && { block: link.block }),
      line: link.line,
    }
  }

  /** The notes with `tag` or a tag nested under it (`tag/sub`), by node id. */
  private tagged(tag: string): Set<string> {
    const key = tagKey(tag)
    const nested = this.db.queryNodes({
      label: 'Tag',
      prefix: { property: 'key', value: `${key}/` },
    })
    const notes = new Set<string>()
    for (const id of [TAG + key, ...nested.map((node) => node.id)])
      for (const hit of this.db.neighbors({
        nodeId: id,
        direction: 'in',
        edgeType: 'TAGGED',
      }))
        notes.add(hit.nodeId)
    return notes
  }

  private commit({ nodes, edges, ends }: Pending): void {
    // A tag or key no edge reaches any more goes with this commit.
    const reached = new Set<string>()
    for (const edge of edges.values()) if (edge) reached.add(edge.to)
    for (const id of ends) {
      if (reached.has(id) || nodes.get(id) === null) continue
      const kept = this.db
        .neighbors({ nodeId: id, direction: 'in' })
        .some((hit) => !edges.has(hit.edgeId))
      if (!kept) nodes.set(id, null)
    }
    if (nodes.size === 0 && edges.size === 0) return
    const batch = {
      deleteEdges: [] as Array<string>,
      deleteNodes: [] as Array<string>,
      upsertNodes: [] as Array<GraphNode>,
      upsertEdges: [] as Array<Edge>,
    }
    for (const [id, edge] of edges)
      if (edge) batch.upsertEdges.push(edge)
      else batch.deleteEdges.push(id)
    for (const [id, node] of nodes)
      if (node) batch.upsertNodes.push(node)
      else batch.deleteNodes.push(id)
    this.db.mutate(batch)
    if (statSync(this.file).size >= Math.max(2 * this.compacted, COMPACT_FLOOR))
      this.compact()
  }

  /** Rewrites the file without what earlier writes replaced. */
  private compact(): void {
    this.db.compact()
    this.compacted = statSync(this.file).size
  }
}
