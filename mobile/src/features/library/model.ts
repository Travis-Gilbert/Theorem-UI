// SOURCING: none. What a Files API entry is, as a row of the Library: its type, title, folder and excerpt. Pure, so it is tested without a device.
//
// Theorem's Files API (theorem-files/1) lists one vault of paths. A path is
// backed by a document, a plan or a plain file; the type a person sees is
// derived from that backing and the file's extension, nothing more.
import type { Theorem } from '@theoremharness/sdk'

export type ItemType = 'note' | 'generated' | 'pdf' | 'page' | 'other'

export type LibraryItem = {
  path: string
  title: string
  type: ItemType
  /** The word on the row: Note, App, PDF, Saved page, Plan, File. */
  label: string
  /** The folder at the top of the path, where a project's files live. */
  folder?: string
  modifiedMs: number
  readOnly: boolean
  size: number
  documentId?: string
  /** A search hit's matching text, without markup. */
  excerpt?: string
}

/** The filters on the Library root. Everything else appears under All. */
export const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'note', label: 'Notes' },
  { id: 'generated', label: 'Generated' },
  { id: 'pdf', label: 'PDFs' },
  { id: 'page', label: 'Saved pages' },
] as const
export type Filter = (typeof FILTERS)[number]['id']

export const isFilter = (value: unknown): value is Filter => FILTERS.some((filter) => filter.id === value)

const extensionOf = (path: string) => /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase()
const baseOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** The name of a path without its extension. */
export const titleFromPath = (path: string) => baseOf(path).replace(/\.[A-Za-z0-9]+$/, '') || baseOf(path)

/** The top-level folder of a path; undefined for a file at the root. */
export const folderOf = (path: string) => (path.includes('/') ? path.slice(0, path.indexOf('/')) : undefined)

const PAGE_EXTENSIONS = new Set(['html', 'htm', 'mhtml', 'webarchive'])
const NOTE_EXTENSIONS = new Set(['md', 'markdown', 'txt'])

export function classify(entry: Pick<Theorem.FilesEntry, 'backing' | 'path' | 'document'>): {
  type: ItemType
  label: string
} {
  if (entry.backing === 'plan') return { type: 'other', label: 'Plan' }
  if (entry.backing === 'document') {
    const kind = entry.document?.documentKind
    if (kind === 'theorem.app') return { type: 'generated', label: 'App' }
    if (entry.document?.origin.kind === 'agent_encoded') return { type: 'generated', label: 'Generated' }
    if (kind === 'skill') return { type: 'other', label: 'Skill' }
    return { type: 'note', label: 'Note' }
  }
  const extension = extensionOf(entry.path)
  if (extension === 'pdf') return { type: 'pdf', label: 'PDF' }
  if (extension && PAGE_EXTENSIONS.has(extension)) return { type: 'page', label: 'Saved page' }
  if (extension && NOTE_EXTENSIONS.has(extension)) return { type: 'note', label: 'Note' }
  return { type: 'other', label: 'File' }
}

export function toItem(entry: Theorem.FilesEntry): LibraryItem {
  return {
    path: entry.path,
    title: titleFromPath(entry.path),
    ...classify(entry),
    folder: folderOf(entry.path),
    modifiedMs: Number(entry.mtimeMs),
    readOnly: entry.readOnly,
    size: Number(entry.size),
    documentId: entry.document?.documentId,
  }
}

export const itemsOf = (entries: readonly Theorem.FilesEntry[]) =>
  entries.filter((entry) => entry.kind === 'file').map(toItem)

export const byRecency = (a: LibraryItem, b: LibraryItem) => b.modifiedMs - a.modifiedMs

export const ofFilter = (items: readonly LibraryItem[], filter: Filter) =>
  filter === 'all' ? [...items] : items.filter((item) => item.type === filter)

/** The folders directly inside `folder` (the root when undefined), by name. */
export function foldersIn(entries: readonly Theorem.FilesEntry[], folder?: string): string[] {
  const prefix = folder ? `${folder}/` : ''
  return entries
    .filter((entry) => entry.kind === 'directory' && entry.path.startsWith(prefix) && !entry.path.slice(prefix.length).includes('/'))
    .map((entry) => entry.path)
    .sort((a, b) => a.localeCompare(b))
}

/** The files directly inside `folder`, newest first. */
export function filesIn(items: readonly LibraryItem[], folder: string): LibraryItem[] {
  const prefix = `${folder}/`
  return items.filter((item) => item.path.startsWith(prefix) && !item.path.slice(prefix.length).includes('/')).sort(byRecency)
}

/** Count of files anywhere under a folder, for its row. */
export const countUnder = (items: readonly LibraryItem[], folder: string) =>
  items.filter((item) => item.path.startsWith(`${folder}/`)).length

/**
 * A search hit's snippet as plain text: the engine's <mark> tags and Markdown
 * heading marks removed, and the title not said twice.
 */
export function cleanSnippet(snippet: string, title: string): string {
  const text = snippet
    .replace(/<\/?mark>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^#+\s*/, '')
    .trim()
  return text.toLowerCase().startsWith(title.toLowerCase()) ? text.slice(title.length).trim() : text
}

/** Search hits as items: the entry gives type and time, the hit gives title and excerpt. */
export function hitsToItems(hits: readonly Theorem.FilesSearchHit[], items: readonly LibraryItem[]): LibraryItem[] {
  const byPath = new Map(items.map((item) => [item.path, item]))
  return hits.flatMap((hit) => {
    const item = byPath.get(hit.path)
    if (!item) return []
    return [{ ...item, title: hit.title || item.title, excerpt: cleanSnippet(hit.snippet, hit.title || item.title) }]
  })
}

/** Add `path` to the pins, or take it out if it is there. */
export const togglePath = (pins: readonly string[], path: string) =>
  pins.includes(path) ? pins.filter((pinned) => pinned !== path) : [path, ...pins]

/** "Note · Mott proposal · 12 minutes ago" */
export const metaLine = (item: LibraryItem, when: string) => [item.label, item.folder, when].filter(Boolean).join(' · ')
