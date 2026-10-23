// SOURCING: loro-crdt (the workspace's block state document; imports merge,
// so updates from any number of views arrive in any order), lodash-es's
// debounce (one write after a burst of edits) and write-file-atomic through
// files.ts. Kept in the app data folder, never in the workspace (plan D9).
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { debounce } from 'lodash-es'
import { LoroDoc } from 'loro-crdt/base64'
import type { WorkspaceId } from '#/lib/workspace/types'
import { writeAtomic } from '../workspace/files'

type Listener = (update: Uint8Array) => void

/** One workspace's block state: the `state("name")` collections. */
export class StateDocument {
  private readonly doc = new LoroDoc()
  private readonly listeners = new Set<Listener>()
  private readonly save = debounce(() => void this.persist(), 250, {
    maxWait: 2000,
  })

  private constructor(private readonly file: string) {}

  static async open(file: string): Promise<StateDocument> {
    const document = new StateDocument(file)
    try {
      document.doc.import(new Uint8Array(await readFile(file)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return document
  }

  /** The whole document, for a replica that is starting. */
  snapshot(): Uint8Array {
    return this.doc.export({ mode: 'snapshot' })
  }

  /** Merges an update from a replica and passes it on to the others. */
  apply(update: Uint8Array): void {
    this.doc.import(update)
    this.save()
    for (const listener of this.listeners) listener(update)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** The collections as plain values, for tests and diagnostics. */
  toJSON(): Record<string, unknown> {
    return this.doc.toJSON() as Record<string, unknown>
  }

  async persist(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true })
    await writeAtomic(this.file, this.snapshot())
  }

  async close(): Promise<void> {
    this.save.cancel()
    this.listeners.clear()
    await this.persist()
  }
}

const open = new Map<WorkspaceId, Promise<StateDocument>>()

/** The state document of a workspace, kept at `<dataDir>/state.loro`. */
export function stateDocument(
  id: WorkspaceId,
  dataDir: string,
): Promise<StateDocument> {
  let document = open.get(id)
  if (!document) {
    document = StateDocument.open(path.join(dataDir, 'state.loro'))
    open.set(id, document)
    document.catch(() => open.delete(id))
  }
  return document
}

/** Saves and forgets a workspace's state document, when the workspace closes. */
export async function closeStateDocument(id: WorkspaceId): Promise<void> {
  const document = open.get(id)
  open.delete(id)
  await (await document)?.close()
}
