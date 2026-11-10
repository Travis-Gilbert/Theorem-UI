// SOURCING: @dnd-kit/sortable arrayMove (a section dragged to another's place); sections are the panel's own arrangement, kept in Theorem by notes-layout.ts, while Theorem's collections are the folders inside them
//
// The Notes panel lists its rows under sections the person makes, names,
// orders, folds away and deletes. A row is a folder, a loose note, or the
// folder of what agents wrote. A row the person never placed sits in its
// kind's own section while that is there, and in the first section otherwise,
// so deleting a section never loses a row. There is always one section.
import { arrayMove } from '@dnd-kit/sortable'

export type SectionId = string

export type Section = {
  readonly id: SectionId
  readonly name: string
  readonly collapsed: boolean
}

/** What a section holds: a folder, a loose note, or the agents' folder. */
export type SectionItem = `folder:${string}` | `note:${string}` | 'agents'

export type SectionLayout = {
  readonly sections: readonly [Section, ...Section[]]
  /** Where the person put a row; a row not here sits in its own section. */
  readonly placed: Readonly<Partial<Record<SectionItem, SectionId>>>
}

export const folderItem = (collectionId: string): SectionItem =>
  `folder:${collectionId}`
export const noteItem = (documentId: string): SectionItem =>
  `note:${documentId}`
export const AGENTS_ITEM: SectionItem = 'agents'

export const isSectionItem = (id: string): id is SectionItem =>
  id === AGENTS_ITEM || id.startsWith('folder:') || id.startsWith('note:')

const section = (id: SectionId, name: string): Section => ({
  id,
  name,
  collapsed: false,
})

export const START_LAYOUT: SectionLayout = {
  sections: [
    section('folders', 'Folders'),
    section('notes', 'Notes'),
    section('agents', 'Agents'),
  ],
  placed: {},
}

/** Each kind of row's own section, one of the starting three. */
const homeOf = (item: SectionItem): SectionId =>
  item === AGENTS_ITEM
    ? 'agents'
    : item.startsWith('folder:')
      ? 'folders'
      : 'notes'

const has = (
  layout: SectionLayout,
  id: SectionId | undefined,
): id is SectionId =>
  id !== undefined && layout.sections.some((s) => s.id === id)

export function sectionOf(layout: SectionLayout, item: SectionItem): SectionId {
  const placed = layout.placed[item]
  if (has(layout, placed)) return placed
  const home = homeOf(item)
  return has(layout, home) ? home : layout.sections[0].id
}

const withSections = (
  layout: SectionLayout,
  sections: readonly Section[],
): SectionLayout =>
  sections.length
    ? { ...layout, sections: sections as SectionLayout['sections'] }
    : layout

const editSection = (
  layout: SectionLayout,
  id: SectionId,
  edit: (s: Section) => Section,
) =>
  withSections(
    layout,
    layout.sections.map((s) => (s.id === id ? edit(s) : s)),
  )

/** A new section after the one pointed at, or last; its id comes from the caller. */
export function addSection(
  layout: SectionLayout,
  id: SectionId,
  after?: SectionId,
): SectionLayout {
  if (has(layout, id)) return layout
  const at = layout.sections.findIndex((s) => s.id === after)
  const sections = [...layout.sections]
  sections.splice(
    at === -1 ? sections.length : at + 1,
    0,
    section(id, 'New section'),
  )
  return withSections(layout, sections)
}

/** The name the person typed, trimmed; an empty one keeps the name it had. */
export function renameSection(
  layout: SectionLayout,
  id: SectionId,
  wanted: string,
): SectionLayout {
  const name = wanted.trim()
  return name ? editSection(layout, id, (s) => ({ ...s, name })) : layout
}

/** Removes a section, but never the last; its rows go back to their own. */
export function deleteSection(
  layout: SectionLayout,
  id: SectionId,
): SectionLayout {
  if (layout.sections.length === 1 || !has(layout, id)) return layout
  const placed = Object.fromEntries(
    Object.entries(layout.placed).filter(([, to]) => to !== id),
  )
  return withSections(
    { ...layout, placed },
    layout.sections.filter((s) => s.id !== id),
  )
}

/** Moves a section to where the one it was dropped on is. */
export function moveSection(
  layout: SectionLayout,
  id: SectionId,
  overId: SectionId,
): SectionLayout {
  const from = layout.sections.findIndex((s) => s.id === id)
  const to = layout.sections.findIndex((s) => s.id === overId)
  if (from === -1 || to === -1 || from === to) return layout
  return withSections(layout, arrayMove([...layout.sections], from, to))
}

export function placeItem(
  layout: SectionLayout,
  item: SectionItem,
  id: SectionId,
): SectionLayout {
  return has(layout, id)
    ? { ...layout, placed: { ...layout.placed, [item]: id } }
    : layout
}

/**
 * The section folded or opened as the person chose. It names the state, not a
 * flip, so making it again over another device's layout keeps their choice.
 */
export const foldSection = (
  layout: SectionLayout,
  id: SectionId,
  collapsed: boolean,
) => editSection(layout, id, (s) => ({ ...s, collapsed }))

/**
 * A click on a section's heading: the other way from the first layout it is
 * made over, which is this device's latest, earlier clicks included. Made again
 * over another device's layout, it keeps that choice rather than flipping theirs.
 */
export function refold(id: SectionId) {
  let collapsed: boolean | undefined
  return (layout: SectionLayout) => {
    collapsed ??= !layout.sections.find((s) => s.id === id)?.collapsed
    return foldSection(layout, id, collapsed)
  }
}

/** Each section's rows, kept in the order they came in. */
export function groupBySection<T>(
  layout: SectionLayout,
  rows: readonly T[],
  itemOf: (row: T) => SectionItem,
): Map<SectionId, T[]> {
  const grouped = new Map(layout.sections.map((s) => [s.id, [] as T[]]))
  for (const row of rows) grouped.get(sectionOf(layout, itemOf(row)))?.push(row)
  return grouped
}
