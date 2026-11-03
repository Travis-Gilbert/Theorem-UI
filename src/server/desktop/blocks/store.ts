// SOURCING: node:fs and write-file-atomic through files.ts. Content-addressed
// JSON files in the app data folder: compiled cells by compile key, last-run
// values by source hash (plan D9). Nothing here is ever written into a
// workspace folder.
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { CompiledCell } from '#/lib/blocks/compile'
import type { LastRun } from '#/lib/blocks/last-run'
import { WorkspaceError } from '../workspace/errors'
import { writeAtomic } from '../workspace/files'

const HASH = /^[0-9a-f]{64}$/

/** A SHA-256 hex key, or a 400. */
export function checkKey(key: string): string {
  if (!HASH.test(key))
    throw new WorkspaceError(400, 'invalid_key', 'Expected a SHA-256 hex key')
  return key
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeAtomic(file, new TextEncoder().encode(JSON.stringify(value)))
}

/** A workspace's block files under its app data folder. */
export class BlockStore {
  constructor(readonly dataDir: string) {}

  private compiledFile(key: string) {
    return path.join(this.dataDir, 'compiled', `${checkKey(key)}.json`)
  }

  private lastRunFile(hash: string) {
    return path.join(this.dataDir, 'last-run', `${checkKey(hash)}.json`)
  }

  readCompiled(key: string): Promise<CompiledCell | null> {
    return readJson<CompiledCell>(this.compiledFile(key))
  }

  async writeCompiled(cell: CompiledCell): Promise<void> {
    await writeJson(this.compiledFile(cell.key), cell)
  }

  readLastRun(hash: string): Promise<LastRun | null> {
    return readJson<LastRun>(this.lastRunFile(hash))
  }

  async writeLastRun(hash: string, run: LastRun): Promise<void> {
    await writeJson(this.lastRunFile(hash), run)
  }
}
