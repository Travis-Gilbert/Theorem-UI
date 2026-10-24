// SOURCING: node:path (posix normalization) and node:fs realpath. Keeping a
// request path inside the workspace root is the platform's path arithmetic
// plus one containment check, as in grants.ts; no library adds to it.
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { WorkspaceError } from './errors'

/** The folder inside each workspace that only the service writes. */
export const INTERNAL_DIR = '.theorem'

/**
 * Normalizes a workspace-relative path from a request: POSIX separators, no
 * leading slash, no `.` or `..` segments. Throws on anything that would leave
 * the root or that a file system cannot hold.
 */
export function normalizeRelative(input: string): string {
  if (typeof input !== 'string' || input.length === 0)
    throw new WorkspaceError(400, 'path_required', 'A path is required')
  if (input.includes('\0') || input.includes('\\'))
    throw new WorkspaceError(400, 'path_invalid', `Invalid path: ${input}`)
  if (input.startsWith('/') || path.win32.isAbsolute(input))
    throw new WorkspaceError(
      403,
      'path_outside_workspace',
      `${input} is not inside the workspace`,
    )
  const segments = input.split('/')
  if (segments.includes('..'))
    throw new WorkspaceError(
      403,
      'path_outside_workspace',
      `${input} is not inside the workspace`,
    )
  const normalized = path.posix.normalize(input).replace(/\/+$/, '')
  if (normalized === '.' || normalized === '')
    throw new WorkspaceError(
      400,
      'path_is_root',
      'The workspace root is not an entry',
    )
  return normalized
}

/** True when `relative` is `.theorem` or inside it. */
export function isInternal(relative: string): boolean {
  return relative === INTERNAL_DIR || relative.startsWith(`${INTERNAL_DIR}/`)
}

/**
 * Entries the workspace does not model: dot-prefixed files and folders (the
 * way Obsidian hides them, which also covers `.theorem` and `.git`) and
 * `node_modules`.
 */
export function isHidden(relative: string): boolean {
  return relative
    .split('/')
    .some((segment) => segment.startsWith('.') || segment === 'node_modules')
}

/** True when `target` is `root` or below it. Both must be absolute. */
export function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  )
}

/**
 * The absolute path for `relative` inside `root` (a realpath). The deepest
 * part of the path that exists is resolved with realpath, so a symbolic link
 * cannot lead outside the root, whether the entry exists yet or not.
 */
export async function resolveInside(
  root: string,
  relative: string,
): Promise<string> {
  const absolute = path.join(root, ...relative.split('/'))
  let probe = absolute
  for (;;) {
    try {
      const real = await realpath(probe)
      if (!isInside(root, real))
        throw new WorkspaceError(
          403,
          'path_outside_workspace',
          `${relative} leads outside the workspace`,
        )
      return absolute
    } catch (error) {
      if (error instanceof WorkspaceError) throw error
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error
      const parent = path.dirname(probe)
      if (parent === probe || !isInside(root, parent)) return absolute
      probe = parent
    }
  }
}

/** The workspace-relative POSIX path of an absolute path below `root`. */
export function toRelative(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/')
}
