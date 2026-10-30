// SOURCING: async-mutex (one operation at a time per workspace, so a watcher
// reconcile never sees a write, rename or remove half done) over the modules
// beside this one. Reconciling the index with the disk, including pairing a
// delete and a create into a rename (plan D8), is hand-rolled: it is this
// service's own model of a folder, which no watcher or library provides.
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
} from 'node:fs/promises'
import path from 'node:path'
import { Mutex } from 'async-mutex'
import type {
  EntryId,
  FileContent,
  FolderSettings,
  SearchHit,
  WorkspaceEntry,
  WorkspaceEvent,
  WorkspaceGraph,
  WorkspaceId,
  WorkspaceLink,
  WorkspaceSummary,
} from '#/lib/workspace/types'
import { WorkspaceError, notFound } from './errors'
import {
  comparableHash,
  moveToTrash,
  sha256,
  statEntry,
  walk,
  writeAtomic,
} from './files'
import type { DiskEntry } from './files'
import { readFolderSettings, writeFolderSettings } from './folder-settings'
import { IDS_FILE, IdStore, isEntryId } from './identity'
import { WorkspaceIndex } from './index-db'
import type { IndexedEntry } from './index-db'
import { parseDestination, parseNote, parseWikiTarget } from './markdown'
import type { ParsedNote } from './markdown'
import { isHidden, normalizeRelative, resolveInside } from './paths'
import { nameKey, resolveLink } from './resolve'
import { applyEdits, findLinkSpans, retarget } from './rewrite'
import type { LinkSpan } from './rewrite'
import { watchFolder } from './watcher'
import type { FolderWatcher, WatchOptions } from './watcher'

export interface ServiceOptions {
  /** The app data folder for this workspace: its index and settings. */
  dataDir: string
  /** Moves an entry to the system trash. Tests pass their own. */
  trash?: (absolute: string) => Promise<void>
  /** Watcher timing, or false to run without a watcher. */
  watch?: WatchOptions | false
}

interface Settings {
  trusted?: boolean
}

/** A file's bytes and what they hash and parse to. */
interface FileState {
  bytes: Uint8Array
  hash: string
  normHash: string
  note?: ParsedNote
}

/** A note whose links a rename may break, read before the move. */
interface RewritePlan {
  source: string
  hash: string
  text: string
  links: Array<{ span: LinkSpan; resolved: string }>
}

const isMarkdown = (entryPath: string) => /\.md$/i.test(entryPath)

// Keeps a byte order mark in the text, so writing the text back keeps it too.
const decoder = new TextDecoder('utf-8', { ignoreBOM: true })
const encoder = new TextEncoder()

function readState(entryPath: string, bytes: Uint8Array): FileState {
  return {
    bytes,
    hash: sha256(bytes),
    normHash: comparableHash(bytes),
    note: isMarkdown(entryPath) ? parseNote(decoder.decode(bytes)) : undefined,
  }
}

function theoremId(state: FileState | undefined): EntryId | undefined {
  const value = state?.note?.properties['theorem-id']
  return isEntryId(value) ? value : undefined
}

const toPublic = ({
  hash: _hash,
  normHash: _normHash,
  ...entry
}: IndexedEntry): WorkspaceEntry => entry

const depth = (entryPath: string) => entryPath.split('/').length
const shallowFirst = (a: string, b: string) =>
  depth(a) - depth(b) || (a < b ? -1 : a > b ? 1 : 0)

async function readBytes(
  absolute: string,
  relative: string,
): Promise<Uint8Array | null> {
  try {
    return await readFile(absolute)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    if (code === 'EISDIR')
      throw new WorkspaceError(409, 'is_directory', `${relative} is a folder`)
    throw error
  }
}

async function readSettings(dataDir: string): Promise<Settings> {
  try {
    return JSON.parse(
      await readFile(path.join(dataDir, 'settings.json'), 'utf8'),
    ) as Settings
  } catch {
    return {}
  }
}

/**
 * One open folder: its ids, its index and its watcher. Every change goes
 * through here, under one lock, and comes out as `WorkspaceEvent`s. Changes
 * made through the service are recorded before the watcher sees them, so the
 * watcher finds nothing new and reports only what other programs did.
 */
export class WorkspaceService {
  private readonly listeners = new Set<(event: WorkspaceEvent) => void>()
  private readonly closeListeners = new Set<() => void>()
  private readonly mutex = new Mutex()
  private watcher: FolderWatcher | null = null
  private closed = false

  private constructor(
    readonly id: WorkspaceId,
    readonly name: string,
    readonly root: string,
    private readonly ids: IdStore,
    private readonly index: WorkspaceIndex,
    private readonly options: ServiceOptions,
    private trusted: boolean,
  ) {}

  /** Opens `folder`, catches the index up with it and starts watching it. */
  static async open(
    folder: string,
    id: WorkspaceId,
    name: string,
    options: ServiceOptions,
  ): Promise<WorkspaceService> {
    const root = await realpath(folder)
    const ids = await IdStore.load(root)
    const index = await WorkspaceIndex.open(
      path.join(options.dataDir, 'index.rr'),
    )
    const settings = await readSettings(options.dataDir)
    const service = new WorkspaceService(
      id,
      name,
      root,
      ids,
      index,
      options,
      settings.trusted === true,
    )
    try {
      if (options.watch !== false)
        service.watcher = await watchFolder(
          root,
          (paths) => {
            service.sync(paths).catch((error: unknown) => {
              console.error(`[workspace] reconciling ${root} failed`, error)
            })
          },
          options.watch,
        )
      await service.sync('all')
    } catch (error) {
      await service.close()
      throw error
    }
    return service
  }

  summary(): WorkspaceSummary {
    return {
      id: this.id,
      name: this.name,
      path: this.root,
      trusted: this.trusted,
      policy: 'LocalOnly',
    }
  }

  subscribe(listener: (event: WorkspaceEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Called once when the workspace closes, such as when its grant is withdrawn. */
  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener)
    return () => this.closeListeners.delete(listener)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.watcher?.close()
    await this.mutex.waitForUnlock()
    this.index.close()
    for (const listener of this.closeListeners) listener()
    this.closeListeners.clear()
    this.listeners.clear()
  }

  // Reads ------------------------------------------------------------------

  tree(): Array<WorkspaceEntry> {
    return this.index.entries().map(toPublic)
  }

  async read(input: string): Promise<FileContent> {
    const relative = normalizeRelative(input)
    const bytes = await readBytes(
      await resolveInside(this.root, relative),
      relative,
    )
    if (!bytes) throw notFound(relative)
    return { bytes, hash: sha256(bytes) }
  }

  resolve(
    target: string,
    from: string,
    syntax: 'wiki' | 'markdown' = 'wiki',
  ): string | null {
    const parts =
      syntax === 'markdown' ? parseDestination(target) : parseWikiTarget(target)
    return resolveLink(
      parts.target,
      normalizeRelative(from),
      syntax,
      this.index,
    )
  }

  links(input: string): Array<WorkspaceLink> {
    return this.index.links(this.known(input))
  }

  backlinks(input: string): Array<WorkspaceLink> {
    return this.index.backlinks(this.known(input))
  }

  graph(): WorkspaceGraph {
    return this.index.graph()
  }

  search(query: string, limit = 20): Array<SearchHit> {
    return this.index.search(query, Math.min(Math.max(1, limit), 100))
  }

  tags(): Array<{ tag: string; count: number }> {
    return this.index.tags()
  }

  properties(input: string): Record<string, unknown> {
    return this.index.properties(this.known(input))
  }

  /** The folder's own settings (plan D8). */
  folderSettings(): Promise<FolderSettings> {
    return readFolderSettings(this.root)
  }

  setFolderSettings(settings: unknown): Promise<FolderSettings> {
    return this.exclusive(() => writeFolderSettings(this.root, settings))
  }

  // Changes ----------------------------------------------------------------

  /**
   * Writes a file atomically. `expectedHash` must match the file on disk, or be
   * null for a file that must not exist yet; otherwise this throws a 412 with
   * the current hash. Missing parent folders are created.
   */
  async write(
    input: string,
    data: Uint8Array,
    expectedHash?: string | null,
  ): Promise<{ hash: string }> {
    const relative = this.changeable(input)
    return this.exclusive(async () => {
      const absolute = await resolveInside(this.root, relative)
      const current = await readBytes(absolute, relative)
      const currentHash = current && sha256(current)
      if (expectedHash !== undefined && expectedHash !== currentHash)
        throw new WorkspaceError(
          412,
          'precondition_failed',
          `${relative} changed on disk`,
          { currentHash },
        )
      const events = await this.makeFolders(path.posix.dirname(relative))
      await writeAtomic(absolute, data)
      const entry = await this.record(relative, data)
      events.push(
        current
          ? {
              type: 'changed',
              entry: toPublic(entry),
              hash: entry.hash!,
              origin: 'app',
            }
          : { type: 'created', entry: toPublic(entry), origin: 'app' },
      )
      await this.finish(events)
      return { hash: entry.hash! }
    })
  }

  /** Creates a folder and any missing parents. 409 when it already exists. */
  async mkdir(input: string): Promise<void> {
    const relative = this.changeable(input)
    await this.exclusive(async () => {
      const absolute = await resolveInside(this.root, relative)
      if (await this.exists(absolute))
        throw new WorkspaceError(
          409,
          'already_exists',
          `${relative} already exists`,
        )
      await this.finish(await this.makeFolders(relative))
    })
  }

  /**
   * Renames or moves an entry. It and everything below it keep their ids, and
   * every link that pointed at a moved file is rewritten to keep pointing at
   * it, in the style it was written.
   */
  async rename(fromInput: string, toInput: string): Promise<void> {
    const from = this.changeable(fromInput)
    const to = this.changeable(toInput)
    if (from === to) return
    if (to.startsWith(`${from}/`))
      throw new WorkspaceError(
        400,
        'rename_into_itself',
        `${from} cannot move inside itself`,
      )
    await this.exclusive(async () => {
      const fromAbsolute = await resolveInside(this.root, from)
      const toAbsolute = await resolveInside(this.root, to)
      // Take in anything the watcher has not reported yet.
      await this.reconcile(new Set([from]))
      const moves = this.index
        .subtree(from)
        .map(
          (entry) => [entry.path, to + entry.path.slice(from.length)] as const,
        )
      if (moves.length === 0) throw notFound(from)
      if (
        (await this.exists(toAbsolute)) &&
        !(await this.sameFile(fromAbsolute, toAbsolute))
      )
        throw new WorkspaceError(409, 'already_exists', `${to} already exists`)

      const moved = new Map<string, string>(moves)
      const plans = await this.planRewrites(moved)
      const events = await this.makeFolders(path.posix.dirname(to))
      await rename(fromAbsolute, toAbsolute)
      this.index.transaction(() => {
        for (const [a, b] of moves) {
          this.ids.move(a, b)
          this.index.moveEntry(a, b)
        }
      })
      for (const [a, b] of moves)
        events.push({
          type: 'renamed',
          id: this.ids.get(b)!,
          from: a,
          to: b,
          origin: 'app',
        })
      for (const plan of plans) {
        const event = await this.rewrite(plan, moved)
        if (event) events.push(event)
      }
      await this.finish(events)
    })
  }

  /** Moves an entry to the system trash. Nothing is deleted permanently. */
  async remove(input: string): Promise<void> {
    const relative = this.changeable(input)
    await this.exclusive(async () => {
      const absolute = await resolveInside(this.root, relative)
      await this.reconcile(new Set([relative]))
      const entries = this.index.subtree(relative)
      if (entries.length === 0) throw notFound(relative)
      await (this.options.trash ?? moveToTrash)(absolute)
      this.index.transaction(() => {
        for (const entry of entries) {
          this.ids.delete(entry.path)
          this.index.removeEntry(entry.path)
        }
      })
      await this.finish(
        entries.reverse().map((entry) => ({
          type: 'deleted',
          id: entry.id,
          path: entry.path,
          origin: 'app',
        })),
      )
    })
  }

  async setTrusted(trusted: boolean): Promise<void> {
    await mkdir(this.options.dataDir, { recursive: true })
    await writeAtomic(
      path.join(this.options.dataDir, 'settings.json'),
      encoder.encode(`${JSON.stringify({ trusted }, null, 2)}\n`),
    )
    this.trusted = trusted
  }

  /** Brings the index up to date with the disk, for some paths or all of them. */
  sync(scope: Set<string> | 'all'): Promise<void> {
    return this.exclusive(() => this.reconcile(scope))
  }

  /** Empties the index and builds it again from the folder. */
  rebuild(): Promise<void> {
    return this.exclusive(async () => {
      this.index.clear()
      await this.reconcile('all', true)
    })
  }

  // Internals --------------------------------------------------------------

  private absolute(relative: string): string {
    return path.join(this.root, ...relative.split('/'))
  }

  /** A path a request may change: inside the workspace and not hidden. */
  private changeable(input: string): string {
    const relative = normalizeRelative(input)
    if (isHidden(relative))
      throw new WorkspaceError(
        403,
        'path_hidden',
        `${relative} is hidden; Theorem does not change hidden entries such as .theorem`,
      )
    return relative
  }

  /** The path of an entry the index holds, or a 404. */
  private known(input: string): string {
    const relative = normalizeRelative(input)
    if (!this.index.entry(relative)) throw notFound(relative)
    return relative
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.closed)
      return Promise.reject(
        new WorkspaceError(404, 'workspace_closed', `${this.name} is closed`),
      )
    return this.mutex.runExclusive(fn)
  }

  private async exists(absolute: string): Promise<boolean> {
    try {
      await stat(absolute)
      return true
    } catch {
      return false
    }
  }

  /**
   * The entry at `relative`, spelled exactly as on disk. On a case-insensitive
   * volume the old name of a case-only rename still answers to stat, so a path
   * the index does not hold is checked against its folder's listing.
   */
  private async onDisk(relative: string): Promise<DiskEntry | null> {
    const entry = await statEntry(this.absolute(relative), relative)
    if (!entry || this.index.entry(relative)) return entry
    const name = path.posix.basename(relative).normalize()
    const names = await readdir(this.absolute(path.posix.dirname(relative)))
    return names.some((n) => n.normalize() === name) ? entry : null
  }

  private async sameFile(a: string, b: string): Promise<boolean> {
    const [x, y] = await Promise.all([stat(a), stat(b)])
    return x.ino === y.ino && x.dev === y.dev
  }

  private emit(events: Array<WorkspaceEvent>): void {
    for (const event of events)
      for (const listener of this.listeners)
        try {
          listener(event)
        } catch (error) {
          console.error('[workspace] an event listener failed', error)
        }
  }

  private async finish(events: Array<WorkspaceEvent>): Promise<void> {
    await this.ids.save()
    this.emit([...events, { type: 'indexed' }])
  }

  /** Indexes the entry at `relative` as it is on disk, given its bytes if a file. */
  private async record(
    relative: string,
    bytes?: Uint8Array,
  ): Promise<IndexedEntry> {
    const disk = await statEntry(this.absolute(relative), relative)
    if (!disk)
      throw new WorkspaceError(500, 'write_failed', `${relative} vanished`)
    const state = bytes && readState(relative, bytes)
    const entry: IndexedEntry = {
      ...disk,
      id: this.ids.ensure(relative, theoremId(state)),
      hash: state?.hash ?? null,
      normHash: state?.normHash ?? null,
    }
    this.index.transaction(() => {
      this.index.putEntry(entry)
      if (state?.note) this.index.putNote(relative, state.note)
      else this.index.clearNote(relative)
    })
    return entry
  }

  /** Creates `folder` and its missing parents, returning their events. */
  private async makeFolders(folder: string): Promise<Array<WorkspaceEvent>> {
    const events: Array<WorkspaceEvent> = []
    if (folder === '.' || folder === '') return events
    const segments = folder.split('/')
    for (let i = 1; i <= segments.length; i++) {
      const relative = segments.slice(0, i).join('/')
      const existing = await statEntry(this.absolute(relative), relative)
      if (existing?.kind === 'directory') continue
      if (existing)
        throw new WorkspaceError(409, 'not_a_folder', `${relative} is a file`)
      await mkdir(this.absolute(relative))
      const entry = await this.record(relative)
      events.push({ type: 'created', entry: toPublic(entry), origin: 'app' })
    }
    return events
  }

  /**
   * Before a move: every note with a link that resolves to a moved file, or
   * that moves itself, with what each of its links resolves to now.
   */
  private async planRewrites(
    moved: Map<string, string>,
  ): Promise<Array<RewritePlan>> {
    const keys = new Set<string>()
    const movedNotes: Array<string> = []
    for (const [from, to] of moved) {
      if (this.index.entry(from)?.kind !== 'file') continue
      keys.add(nameKey(from)).add(nameKey(to))
      if (isMarkdown(from)) movedNotes.push(from)
    }
    const sources = new Set([...this.index.sourcesFor(keys), ...movedNotes])
    const plans: Array<RewritePlan> = []
    for (const source of sources) {
      const bytes = await readBytes(this.absolute(source), source)
      if (!bytes) continue
      const text = decoder.decode(bytes)
      const links: RewritePlan['links'] = []
      for (const span of findLinkSpans(text)) {
        // A link in a note that stays put can only change if its target's name could.
        if (!moved.has(source) && !keys.has(nameKey(span.target))) continue
        const resolved = resolveLink(
          span.target,
          source,
          span.syntax,
          this.index,
        )
        if (resolved) links.push({ span, resolved })
      }
      if (links.length > 0)
        plans.push({ source, hash: sha256(bytes), text, links })
    }
    return plans
  }

  /** After a move: rewrites the links in `plan` that no longer reach their file. */
  private async rewrite(
    plan: RewritePlan,
    moved: Map<string, string>,
  ): Promise<WorkspaceEvent | null> {
    const source = moved.get(plan.source) ?? plan.source
    const edits = plan.links.flatMap(({ span, resolved }) => {
      const desired = moved.get(resolved) ?? resolved
      if (resolveLink(span.target, source, span.syntax, this.index) === desired)
        return []
      return [
        {
          start: span.start,
          end: span.end,
          text: retarget(span, source, desired, this.index),
        },
      ]
    })
    if (edits.length === 0) return null
    const absolute = this.absolute(source)
    const bytes = await readBytes(absolute, source)
    if (!bytes || sha256(bytes) !== plan.hash) {
      console.warn(
        `[workspace] ${source} changed during a rename; its links were left as they were`,
      )
      return null
    }
    const next = encoder.encode(applyEdits(plan.text, edits))
    await writeAtomic(absolute, next)
    const entry = await this.record(source, next)
    return {
      type: 'changed',
      entry: toPublic(entry),
      hash: entry.hash!,
      origin: 'app',
    }
  }

  /**
   * Compares the index with the disk for `scope` (paths the watcher reported,
   * or the whole folder), updates it and emits what changed as `external`.
   * What the service itself wrote is already in the index, so it compares
   * equal and is not reported again. A file that disappeared and one that
   * appeared with the same content (or the same `theorem-id`) are a rename:
   * the id follows the file. `quiet` reports a rebuild as one `resync`.
   */
  private async reconcile(
    scope: Set<string> | 'all',
    quiet = false,
  ): Promise<void> {
    if (this.closed) return
    let resync = false
    if (scope !== 'all' && scope.has(IDS_FILE)) {
      const bytes = await readBytes(this.ids.file, IDS_FILE)
      if (bytes && this.ids.isForeign(bytes)) {
        await this.ids.reload()
        resync = true
      }
    }

    // What the index knows and what the disk holds, for the paths in scope.
    const known = new Map<string, IndexedEntry>()
    const disk = new Map<string, DiskEntry>()
    if (scope === 'all') {
      for (const entry of this.index.entries()) known.set(entry.path, entry)
      for (const [p, entry] of await walk(this.root)) disk.set(p, entry)
    } else {
      for (const p of scope) {
        if (isHidden(p)) continue
        for (const entry of this.index.subtree(p)) known.set(entry.path, entry)
        const entry = await this.onDisk(p)
        if (!entry) continue
        disk.set(p, entry)
        if (entry.kind === 'directory')
          for (const [q, inner] of await walk(this.root, p)) disk.set(q, inner)
        // Parents whose own events were coalesced away.
        for (
          let parent = path.posix.dirname(p);
          parent !== '.' && !disk.has(parent) && !this.index.entry(parent);
          parent = path.posix.dirname(parent)
        ) {
          const folder = await this.onDisk(parent)
          if (folder) disk.set(parent, folder)
        }
      }
      for (const p of disk.keys())
        if (!known.has(p)) {
          const entry = this.index.entry(p)
          if (entry) known.set(p, entry)
        }
    }

    // Read the files that are new or may have changed.
    const states = new Map<string, FileState>()
    for (const [p, entry] of disk) {
      if (entry.kind !== 'file') continue
      const before = known.get(p)
      const unchanged =
        before?.kind === 'file' &&
        before.normHash !== null &&
        !(scope !== 'all' && scope.has(p)) &&
        before.size === entry.size &&
        before.mtimeMs === entry.mtimeMs
      if (unchanged) continue
      const bytes = await readBytes(this.absolute(p), p)
      if (bytes) states.set(p, readState(p, bytes))
      else disk.delete(p)
    }

    const gone = [...known.values()].filter(
      (entry) => disk.get(entry.path)?.kind !== entry.kind,
    )
    const added = [...disk.values()].filter(
      (entry) => known.get(entry.path)?.kind !== entry.kind,
    )
    const renames = this.pairRenames(gone, added, states)
    const renamedFrom = new Set(renames.keys())
    const renamedTo = new Set(renames.values())

    const events: Array<WorkspaceEvent> = []
    this.index.transaction(() => {
      for (const [from, to] of [...renames].sort(([a], [b]) =>
        shallowFirst(a, b),
      )) {
        const before = known.get(from)!
        const entry = disk.get(to)!
        const state = states.get(to)
        const id = this.ids.move(from, to)
        this.index.moveEntry(from, to)
        this.index.putEntry({
          ...entry,
          id,
          hash: state?.hash ?? before.hash,
          normHash: state?.normHash ?? before.normHash,
        })
        if (!state?.note) this.index.clearNote(to)
        else if (state.normHash !== before.normHash || !isMarkdown(from))
          this.index.putNote(to, state.note)
        events.push({ type: 'renamed', id, from, to, origin: 'external' })
        if (state && state.normHash !== before.normHash)
          events.push({
            type: 'changed',
            entry: { ...entry, id },
            hash: state.hash,
            origin: 'external',
          })
      }

      for (const entry of gone
        .filter((e) => !renamedFrom.has(e.path))
        .sort((a, b) => shallowFirst(b.path, a.path))) {
        this.ids.delete(entry.path)
        this.index.removeEntry(entry.path)
        events.push({
          type: 'deleted',
          id: entry.id,
          path: entry.path,
          origin: 'external',
        })
      }

      for (const entry of added
        .filter((e) => !renamedTo.has(e.path))
        .sort((a, b) => shallowFirst(a.path, b.path))) {
        const state = states.get(entry.path)
        const id = this.ids.ensure(entry.path, theoremId(state))
        this.index.putEntry({
          ...entry,
          id,
          hash: state?.hash ?? null,
          normHash: state?.normHash ?? null,
        })
        if (state?.note) this.index.putNote(entry.path, state.note)
        events.push({
          type: 'created',
          entry: { ...entry, id },
          origin: 'external',
        })
      }

      for (const [p, entry] of disk) {
        const before = known.get(p)
        if (!before || before.kind !== entry.kind) continue
        const state = states.get(p)
        if (!state) {
          if (before.mtimeMs !== entry.mtimeMs || before.size !== entry.size)
            this.index.putEntry({ ...before, ...entry, id: before.id })
          continue
        }
        this.index.putEntry({
          ...entry,
          id: before.id,
          hash: state.hash,
          normHash: state.normHash,
        })
        if (state.normHash === before.normHash) continue
        if (state.note) this.index.putNote(p, state.note)
        else this.index.clearNote(p)
        events.push({
          type: 'changed',
          entry: { ...entry, id: before.id },
          hash: state.hash,
          origin: 'external',
        })
      }

      // Keep ids.json and the index in step: every entry has an id, and ids
      // of entries that no longer exist are dropped.
      if (scope === 'all' || resync) {
        const present = new Set<string>()
        for (const entry of this.index.entries()) {
          present.add(entry.path)
          const id = this.ids.ensure(entry.path, entry.id)
          if (id !== entry.id) {
            this.index.putEntry({ ...entry, id })
            resync = true
          }
        }
        for (const p of this.ids.paths())
          if (!present.has(p)) this.ids.delete(p)
      }
    })

    await this.ids.save()
    if (quiet) this.emit([{ type: 'resync' }, { type: 'indexed' }])
    else
      this.emit([
        ...events,
        ...(resync ? [{ type: 'resync' } as const] : []),
        { type: 'indexed' },
      ])
  }

  /**
   * Pairs disappeared entries with appeared ones that are the same entry
   * moved: files by `theorem-id`, then by content (preferring the same name,
   * then the same folder); folders by the files that moved with them, then
   * an only pair of folders under one parent.
   */
  private pairRenames(
    gone: Array<IndexedEntry>,
    added: Array<DiskEntry>,
    states: Map<string, FileState>,
  ): Map<string, string> {
    const pairs = new Map<string, string>()
    const taken = new Set<string>()
    const pair = (from: string, to: string) => {
      if (pairs.has(from) || taken.has(to)) return
      pairs.set(from, to)
      taken.add(to)
    }

    const goneFiles = gone.filter((e) => e.kind === 'file')
    const addedFiles = added.filter(
      (e) => e.kind === 'file' && states.has(e.path),
    )
    for (const entry of addedFiles) {
      const id = theoremId(states.get(entry.path))
      const from = id && this.ids.pathOf(id)
      if (from && goneFiles.some((g) => g.path === from)) pair(from, entry.path)
    }
    for (const entry of addedFiles) {
      if (taken.has(entry.path)) continue
      const { normHash } = states.get(entry.path)!
      const candidates = goneFiles.filter(
        (g) => !pairs.has(g.path) && g.normHash === normHash,
      )
      const name = path.posix.basename(entry.path)
      const folder = path.posix.dirname(entry.path)
      const match =
        candidates.find((g) => path.posix.basename(g.path) === name) ??
        candidates.find((g) => path.posix.dirname(g.path) === folder) ??
        candidates[0]
      if (match) pair(match.path, entry.path)
    }

    const goneDirs = new Set(
      gone.filter((e) => e.kind === 'directory').map((e) => e.path),
    )
    const addedDirs = new Set(
      added.filter((e) => e.kind === 'directory').map((e) => e.path),
    )
    const pairDirs = (from: string, to: string) => {
      if (goneDirs.has(from) && addedDirs.has(to)) pair(from, to)
    }
    for (const [from, to] of [...pairs]) {
      let a = path.posix.dirname(from)
      let b = path.posix.dirname(to)
      while (a !== '.' && b !== '.' && a !== b && goneDirs.has(a)) {
        pairDirs(a, b)
        a = path.posix.dirname(a)
        b = path.posix.dirname(b)
      }
    }
    // Empty folders inside a moved folder.
    for (const to of [...addedDirs].sort(shallowFirst)) {
      if (taken.has(to)) continue
      for (const [a, b] of pairs)
        if (to.startsWith(`${b}/`) && goneDirs.has(a)) {
          pairDirs(a + to.slice(b.length), to)
          break
        }
    }
    // One empty folder renamed in place.
    const lonelyGone = [...goneDirs].filter((d) => !pairs.has(d))
    const lonelyAdded = [...addedDirs].filter((d) => !taken.has(d))
    if (
      lonelyGone.length === 1 &&
      lonelyAdded.length === 1 &&
      path.posix.dirname(lonelyGone[0]!) === path.posix.dirname(lonelyAdded[0]!)
    )
      pair(lonelyGone[0]!, lonelyAdded[0]!)
    return pairs
  }
}
