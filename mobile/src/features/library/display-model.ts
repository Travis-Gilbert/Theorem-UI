// SOURCING: date-fns differenceInCalendarDays. How a Library list is built: grouping, ordering and which row properties show. Pure, so it is tested without a device.
//
// This is Linear's display options model: one list, rebuilt by a few choices,
// instead of a screen per view.
import { differenceInCalendarDays } from 'date-fns'
import { byRecency, countUnder, type LibraryItem } from './model'

export const GROUPINGS = [
  { id: 'overview', label: 'Overview' },
  { id: 'type', label: 'Type' },
  { id: 'folder', label: 'Folder' },
  { id: 'day', label: 'Day' },
] as const
export type Grouping = (typeof GROUPINGS)[number]['id']

export const ORDERINGS = [
  { id: 'recent', label: 'Recently changed' },
  { id: 'title', label: 'Title' },
] as const
export type Ordering = (typeof ORDERINGS)[number]['id']

export const PROPERTIES = [
  { id: 'excerpt', label: 'Excerpt' },
  { id: 'type', label: 'Type' },
  { id: 'folder', label: 'Folder' },
  { id: 'time', label: 'Time' },
] as const
export type Property = (typeof PROPERTIES)[number]['id']

export type Display = { grouping: Grouping; ordering: Ordering; show: Record<Property, boolean> }

export const DEFAULT_DISPLAY: Display = {
  grouping: 'overview',
  ordering: 'recent',
  show: { excerpt: true, type: true, folder: true, time: true },
}

/** A stored value is only used when it is a whole, known display; anything else is the default. */
export function parseDisplay(raw: string | undefined): Display {
  if (!raw) return DEFAULT_DISPLAY
  try {
    const value = JSON.parse(raw) as Partial<Display> | null
    const grouping = GROUPINGS.find((entry) => entry.id === value?.grouping)?.id
    const ordering = ORDERINGS.find((entry) => entry.id === value?.ordering)?.id
    if (!grouping || !ordering || typeof value?.show !== 'object' || value.show === null) return DEFAULT_DISPLAY
    const show = { ...DEFAULT_DISPLAY.show }
    for (const { id } of PROPERTIES) if (typeof value.show[id] === 'boolean') show[id] = value.show[id]
    return { grouping, ordering, show }
  } catch {
    return DEFAULT_DISPLAY
  }
}

export const isDefaultDisplay = (display: Display) => JSON.stringify(display) === JSON.stringify(DEFAULT_DISPLAY)

const byTitle = (a: LibraryItem, b: LibraryItem) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })

export const orderItems = (items: readonly LibraryItem[], ordering: Ordering) =>
  [...items].sort(ordering === 'title' ? byTitle : byRecency)

/** "Today", "Yesterday", "Previous 7 days" or "Earlier", counted in calendar days. */
export function dayGroup(ms: number, now: number = Date.now()) {
  const days = differenceInCalendarDays(now, ms)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days <= 7) return 'Previous 7 days'
  return 'Earlier'
}

const DAY_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Earlier']

export type Group = { key: string; title: string; items: LibraryItem[] }

/** The items in groups. Group order follows the grouping; items follow `ordering`. */
export function groupItems(
  items: readonly LibraryItem[],
  grouping: Exclude<Grouping, 'overview'>,
  ordering: Ordering,
  now: number = Date.now(),
): Group[] {
  const keyOf = (item: LibraryItem) =>
    grouping === 'type' ? item.label : grouping === 'folder' ? (item.folder ?? 'No folder') : dayGroup(item.modifiedMs, now)
  const groups = new Map<string, LibraryItem[]>()
  for (const item of orderItems(items, ordering)) {
    const key = keyOf(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  const titles = [...groups.keys()]
  if (grouping === 'day') titles.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
  else titles.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  return titles.map((title) => ({ key: title, title, items: groups.get(title) ?? [] }))
}

/** Folder names for the Overview section, with how many items each holds. */
export const folderCounts = (items: readonly LibraryItem[], folders: readonly string[]) =>
  folders.map((path) => ({ path, count: countUnder(items, path) }))

/** The row's last line from the properties the person kept on. */
export function metaFor(item: LibraryItem, when: string, show: Display['show'], showFolder = true) {
  return [show.type ? item.label : undefined, show.folder && showFolder ? item.folder : undefined, show.time ? when : undefined]
    .filter(Boolean)
    .join(' · ')
}
