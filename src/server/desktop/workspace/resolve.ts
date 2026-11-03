// SOURCING: hand-roll — Obsidian's link resolution (relative destinations,
// then the vault path, then the shortest path whose name matches, case-
// sensitive before case-insensitive). Obsidian's resolver is closed source and
// no package reproduces it against an index we own; node:path does the joins.
import path from 'node:path'

/** What resolution needs from the index: the files whose name key is `key`. */
export interface LinkLookup {
  named: (key: string) => Array<string>
}

/**
 * The key a link and the file it resolves to share: the base name, lowercased,
 * without a `.md` extension. `[[Note]]`, `[x](../Note.md)` and `Note.md` all
 * have the key `note`.
 */
export function nameKey(entryPath: string): string {
  const base = entryPath.slice(entryPath.lastIndexOf('/') + 1).toLowerCase()
  return base.endsWith('.md') ? base.slice(0, -3) : base
}

const stem = (entryPath: string) => entryPath.replace(/\.md$/i, '')

/** Fewer folders first, then the shorter path, then by code point. */
function byShortestPath(a: string, b: string): number {
  return (
    a.split('/').length - b.split('/').length ||
    a.length - b.length ||
    (a < b ? -1 : a > b ? 1 : 0)
  )
}

/** The file at `entryPath` or `entryPath.md`, matching case exactly. */
function exactly(lookup: LinkLookup, entryPath: string): string | null {
  const files = lookup.named(nameKey(entryPath))
  return (
    files.find((file) => file === entryPath) ??
    files.find((file) => file === `${entryPath}.md`) ??
    null
  )
}

/**
 * The shortest-path file whose path ends with `target`'s segments, case-
 * sensitive matches before case-insensitive ones.
 */
function bySuffix(lookup: LinkLookup, target: string): string | null {
  const want = stem(target)
  const endsWith = (file: string, tail: string) =>
    file === tail || file.endsWith(`/${tail}`)
  const files = lookup.named(nameKey(target))
  const sensitive = files.filter((file) => endsWith(stem(file), want))
  const pool =
    sensitive.length > 0
      ? sensitive
      : files.filter((file) =>
          endsWith(stem(file).toLowerCase(), want.toLowerCase()),
        )
  return pool.sort(byShortestPath)[0] ?? null
}

/** The file at `entryPath` or `entryPath.md`, ignoring case. */
function ignoringCase(lookup: LinkLookup, entryPath: string): string | null {
  const want = stem(entryPath).toLowerCase()
  return (
    lookup
      .named(nameKey(entryPath))
      .find((file) => stem(file).toLowerCase() === want) ?? null
  )
}

/**
 * The path `target` (as written in `fromPath`, without heading or block part)
 * resolves to, or null.
 *
 * - `./` and `../` targets, and Markdown destinations, are tried relative to
 *   the linking note first, as Markdown defines them.
 * - A leading `/` means the workspace root.
 * - Then the target as a workspace path, with or without `.md`.
 * - Then, as Obsidian does for `[[Note]]` and `[[folder/Note]]`, the file with
 *   the shortest path that ends with the target, matching case if any does.
 */
export function resolveLink(
  target: string,
  fromPath: string,
  syntax: 'wiki' | 'markdown',
  lookup: LinkLookup,
): string | null {
  const trimmed = target.trim()
  if (!trimmed) return null
  const explicitRelative = /^\.\.?\//.test(trimmed)

  if (!trimmed.startsWith('/') && (syntax === 'markdown' || explicitRelative)) {
    const joined = path.posix.normalize(
      path.posix.join(path.posix.dirname(fromPath), trimmed),
    )
    if (joined === '..' || joined.startsWith('../')) return null
    const found = exactly(lookup, joined)
    if (found) return found
    if (explicitRelative) return ignoringCase(lookup, joined)
  }

  const vaultPath = path.posix.normalize(trimmed.replace(/^\/+/, ''))
  if (vaultPath === '.' || vaultPath.startsWith('../')) return null
  return exactly(lookup, vaultPath) ?? bySuffix(lookup, vaultPath)
}
