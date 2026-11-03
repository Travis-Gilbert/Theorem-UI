// SOURCING: pathe (basename) and fuzzysort (the quick switcher's matching).
// Obsidian's "Shortest path when possible" for new links, as plain functions
// over the workspace's paths.
import fuzzysort from 'fuzzysort'
import { basename } from 'pathe'

/**
 * The key a link and its file share: the base name, lowercased, without
 * `.md`, as the workspace resolver keys names.
 */
const nameKey = (path: string) =>
  basename(path).toLowerCase().replace(/\.md$/, '')

/**
 * How a new link should name `path`: the base name when no other file in
 * `paths` shares it, else the path. Notes leave out `.md`; other files keep
 * their extension.
 */
export function linkTarget(path: string, paths: Iterable<string>): string {
  const target = path.replace(/\.md$/, '')
  const key = nameKey(path)
  for (const other of paths)
    if (other !== path && nameKey(other) === key) return target
  return basename(target)
}

/**
 * The files whose name or path matches `query`, best first, matched fuzzily
 * as the quick switcher matches. An empty query lists every file, shallow
 * ones first.
 */
export function rankFiles(
  paths: Array<string>,
  query: string,
  limit = 50,
): Array<string> {
  const want = query.trim()
  if (!want) return paths.toSorted(shallowFirst).slice(0, limit)
  return fuzzysort
    .go(want, paths, {
      keys: [(path: string) => basename(path, '.md'), (path: string) => path],
      limit,
      threshold: 0,
    })
    .toSorted((a, b) => b.score - a.score || shallowFirst(a.obj, b.obj))
    .map((result) => result.obj)
}

const shallowFirst = (a: string, b: string) =>
  a.split('/').length - b.split('/').length || a.localeCompare(b)
