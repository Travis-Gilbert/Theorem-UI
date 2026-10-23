// SOURCING: ulid (the ULID in ws_ and vf_ ids); files are written through
// write-file-atomic (files.ts). The two files' shapes are plan D8's.
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { ulid } from 'ulid'
import type { EntryId, WorkspaceId } from '#/lib/workspace/types'
import { WorkspaceError } from './errors'
import { sha256, writeAtomic } from './files'
import { INTERNAL_DIR } from './paths'

export const WORKSPACE_FILE = `${INTERNAL_DIR}/workspace.json`
export const IDS_FILE = `${INTERNAL_DIR}/ids.json`

export const newWorkspaceId = (): WorkspaceId => `ws_${ulid()}`
export const newEntryId = (): EntryId => `vf_${ulid()}`

const ENTRY_ID = /^vf_[0-9A-HJKMNP-TV-Z]{26}$/

/** Only ids of Theorem's own form are honored from frontmatter. */
export const isEntryId = (value: unknown): value is EntryId =>
  typeof value === 'string' && ENTRY_ID.test(value)

export const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`)

/** A JSON file's value; undefined when there is no file. */
export async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new WorkspaceError(
      500,
      'workspace_config_invalid',
      `${file} is not valid JSON`,
    )
  }
}

/** Reads `.theorem/workspace.json`, writing a new id on a folder's first open. */
export async function readWorkspaceId(root: string): Promise<WorkspaceId> {
  const file = path.join(root, WORKSPACE_FILE)
  const existing = (await readJson(file)) as { id?: unknown } | undefined
  if (existing !== undefined) {
    if (typeof existing.id === 'string' && existing.id.startsWith('ws_'))
      return existing.id
    throw new WorkspaceError(
      500,
      'workspace_config_invalid',
      `${file} has no ws_ id`,
    )
  }
  const id = newWorkspaceId()
  await writeWorkspaceId(root, id)
  return id
}

export async function writeWorkspaceId(
  root: string,
  id: WorkspaceId,
): Promise<void> {
  await mkdir(path.join(root, INTERNAL_DIR), { recursive: true })
  await writeAtomic(path.join(root, WORKSPACE_FILE), encode({ id }))
}

/**
 * `.theorem/ids.json`: every entry's id, as a map from path to id sorted by
 * path so it diffs cleanly in git. Ids are never written into user files.
 */
export class IdStore {
  private readonly byPath = new Map<string, EntryId>()
  private readonly byId = new Map<EntryId, string>()
  private dirty = false
  /** Hash of the bytes this store last wrote, to tell its own write from an outside one. */
  private written: string | null = null

  private constructor(private readonly root: string) {}

  static async load(root: string): Promise<IdStore> {
    const store = new IdStore(root)
    await store.reload()
    return store
  }

  get file(): string {
    return path.join(this.root, IDS_FILE)
  }

  /** Replaces the map with the file's contents. */
  async reload(): Promise<void> {
    const data = await readJson(this.file)
    this.byPath.clear()
    this.byId.clear()
    if (data && typeof data === 'object')
      for (const [entryPath, id] of Object.entries(data))
        if (isEntryId(id) && !this.byId.has(id)) this.assign(entryPath, id)
    this.written = data === undefined ? null : sha256(await readFile(this.file))
    this.dirty = false
  }

  /** True when `bytes` are not what this store last read or wrote. */
  isForeign(bytes: Uint8Array): boolean {
    return sha256(bytes) !== this.written
  }

  /** Every path with an id. */
  paths(): Array<string> {
    return [...this.byPath.keys()]
  }

  get(entryPath: string): EntryId | undefined {
    return this.byPath.get(entryPath)
  }

  pathOf(id: EntryId): string | undefined {
    return this.byId.get(id)
  }

  /**
   * The id for `entryPath`. One with none gets `preferred` (a `theorem-id`
   * from its frontmatter) when no other entry holds it, else a new id.
   */
  ensure(entryPath: string, preferred?: EntryId): EntryId {
    const current = this.byPath.get(entryPath)
    if (current) return current
    const id = preferred && !this.byId.has(preferred) ? preferred : newEntryId()
    this.assign(entryPath, id)
    return id
  }

  /** Moves an id from one path to another; the entry keeps it. */
  move(from: string, to: string): EntryId {
    const id = this.byPath.get(from) ?? newEntryId()
    this.delete(from)
    this.assign(to, id)
    return id
  }

  delete(entryPath: string): void {
    const id = this.byPath.get(entryPath)
    if (!id) return
    this.byPath.delete(entryPath)
    this.byId.delete(id)
    this.dirty = true
  }

  private assign(entryPath: string, id: EntryId) {
    const previous = this.byPath.get(entryPath)
    if (previous) this.byId.delete(previous)
    this.byPath.set(entryPath, id)
    this.byId.set(id, entryPath)
    this.dirty = true
  }

  /** Writes the file, atomically and sorted, if anything changed. */
  async save(): Promise<void> {
    if (!this.dirty) return
    const sorted = Object.fromEntries(
      [...this.byPath].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    )
    const bytes = encode(sorted)
    await mkdir(path.join(this.root, INTERNAL_DIR), { recursive: true })
    this.written = sha256(bytes)
    await writeAtomic(this.file, bytes)
    this.dirty = false
  }
}
