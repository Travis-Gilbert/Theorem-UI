// SOURCING: write-file-atomic (temp file, fsync, rename; keeps the existing
// file's mode and owner), trash (the system trash, never a permanent delete),
// fdir (directory walk that prunes hidden folders), node:crypto (SHA-256).
// The text-or-binary test is git's NUL-byte heuristic, one line.
import { createHash } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import path from 'node:path'
import { fdir } from 'fdir'
import trash from 'trash'
import writeFileAtomic from 'write-file-atomic'
import type { WorkspaceEntry } from '#/lib/workspace/types'
import { isHidden } from './paths'

/** An entry as the disk reports it, before it has an id. */
export type DiskEntry = Omit<WorkspaceEntry, 'id'>

/** SHA-256 of the bytes, lowercase hex: the ETag and `FileContent.hash`. */
export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Git's heuristic: a NUL byte in the first 8000 bytes means binary. */
function isText(bytes: Uint8Array): boolean {
  return !bytes.subarray(0, 8000).includes(0)
}

/**
 * The hash that decides whether two contents are the same file: text is
 * compared with its line endings normalized to LF, so a change of line
 * endings alone is not an edit (plan D12).
 */
export function comparableHash(bytes: Uint8Array): string {
  if (!isText(bytes)) return sha256(bytes)
  const text = Buffer.from(bytes).toString('latin1')
  if (!text.includes('\r')) return sha256(bytes)
  return sha256(Buffer.from(text.replace(/\r\n?/g, '\n'), 'latin1'))
}

export async function writeAtomic(
  absolute: string,
  data: Uint8Array,
): Promise<void> {
  await writeFileAtomic(
    absolute,
    Buffer.from(data.buffer, data.byteOffset, data.byteLength),
  )
}

export async function moveToTrash(absolute: string): Promise<void> {
  await trash(absolute, { glob: false })
}

/** The entry at `absolute`, or null when it is missing or a symbolic link. */
export async function statEntry(
  absolute: string,
  relative: string,
): Promise<DiskEntry | null> {
  try {
    const stats = await lstat(absolute)
    if (stats.isSymbolicLink()) return null
    if (!stats.isFile() && !stats.isDirectory()) return null
    return {
      path: relative,
      kind: stats.isDirectory() ? 'directory' : 'file',
      size: stats.isDirectory() ? 0 : stats.size,
      mtimeMs: stats.mtimeMs,
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw error
  }
}

/**
 * Every entry below `absolute` (or the whole root when `relative` is empty),
 * keyed by workspace-relative path. Hidden entries and symbolic links are
 * left out; the walk does not descend into hidden folders.
 */
export async function walk(
  root: string,
  relative = '',
): Promise<Map<string, DiskEntry>> {
  const base = relative ? path.join(root, ...relative.split('/')) : root
  const found = await new fdir()
    .withRelativePaths()
    .withDirs()
    .withPathSeparator('/')
    .exclude((name) => name.startsWith('.') || name === 'node_modules')
    .crawl(base)
    .withPromise()
  const entries = new Map<string, DiskEntry>()
  await Promise.all(
    found.map(async (found) => {
      // fdir lists the crawled folder itself as "." and folders with a slash.
      if (found === '.') return
      const inner = found.replace(/\/$/, '')
      const rel = relative ? `${relative}/${inner}` : inner
      if (isHidden(rel)) return
      const entry = await statEntry(path.join(root, ...rel.split('/')), rel)
      if (entry) entries.set(rel, entry)
    }),
  )
  return entries
}
