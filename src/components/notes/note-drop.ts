// SOURCING: @dnd-kit/core (closestCenter and pointerWithin find what is under a drag) and @dnd-kit/sortable (sortableKeyboardCoordinates steps a section with the arrow keys); what a drop then does to the sections and folders is this panel's own, and so is stepping a row with the arrow keys, since dnd-kit's keyboard steps move only items that are drop targets themselves (sortables), not a note or a folder row
//
// What dragging in the Notes panel lands on, and what the drop does. A section
// is dragged by its heading to another's place. A row (a folder, a loose note,
// the agents' folder) is dragged into a section; a note or a folder can also
// go onto a folder, into it.
import { closestCenter, pointerWithin } from '@dnd-kit/core'
import type {
  Collision,
  CollisionDetection,
  KeyboardCoordinateGetter,
  UniqueIdentifier,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { canNest } from '@/lib/theorem/note-folders'
import type { NoteFolder, NoteFolders } from '@/lib/theorem/note-folders'
import { AGENTS_ITEM, isSectionItem } from './note-sections'
import type { SectionId, SectionItem, SectionLayout } from './note-sections'

/** A section's id as a drop target and as something dragged to a new place. */
export const SECTION = 'section:'
/** A folder's id as the place a note or folder is dropped into. */
export const INTO = 'into:'

export const after = (id: UniqueIdentifier, prefix: string) => {
  const text = String(id)
  return text.startsWith(prefix) ? text.slice(prefix.length) : undefined
}

/**
 * A section goes to the section nearest its middle. A note or a folder goes
 * into the folder under the pointer, else into the section; the agents' folder
 * only ever goes into a section. Dragged with the keyboard, the dragged row's
 * middle is the pointer.
 */
export const collide: CollisionDetection = (args) => {
  const sections = {
    ...args,
    droppableContainers: args.droppableContainers.filter((c) =>
      String(c.id).startsWith(SECTION),
    ),
  }
  if (after(args.active.id, SECTION)) return closestCenter(sections)
  const filing =
    after(args.active.id, 'note:') || after(args.active.id, 'folder:')
  // A keyboard drag has no pointer; the arrow keys centre the dragged row on
  // its target, so the row's middle stands in for one.
  const { collisionRect: r } = args
  const pointerCoordinates = args.pointerCoordinates ?? {
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
  }
  const hits = pointerWithin({
    ...(filing ? args : sections),
    pointerCoordinates,
  })
  const folderFirst = (hit: Collision) => (after(hit.id, INTO) ? 0 : 1)
  return [...hits].sort((a, b) => folderFirst(a) - folderFirst(b))
}

/** One thing a drop does, in the order it does them. */
export type DropStep =
  | { kind: 'move-section'; section: SectionId; to: SectionId }
  | { kind: 'file'; documentId: string; to: string | null }
  | { kind: 'nest'; folderId: string; into: string | null }
  | { kind: 'place'; item: SectionItem; section: SectionId }

type Filed = Pick<NoteFolders, 'folders' | 'folderOf'>

/** The note filed into `to` (null: out of its folder), unless it is there already. */
function file(active: UniqueIdentifier, to: string | null, filed: Filed) {
  const documentId = after(active, 'note:')
  const from = documentId && filed.folderOf.get(documentId)
  return documentId && from !== to && (to !== null || from)
    ? [{ kind: 'file', documentId, to } as const]
    : []
}

/** The folder moved into `into` (null: the top level), where it can go. */
function nest(active: UniqueIdentifier, into: string | null, filed: Filed) {
  const folderId = after(active, 'folder:')
  return folderId && canNest(filed.folders, folderId, into)
    ? [{ kind: 'nest', folderId, into } as const]
    : []
}

/** A row dropped on a section comes out of its folder to sit there. */
function ontoSection(
  active: UniqueIdentifier,
  section: SectionId,
  filed: Filed,
): DropStep[] {
  const item = String(active)
  if (!isSectionItem(item)) return []
  return [
    ...file(active, null, filed),
    ...nest(active, null, filed),
    { kind: 'place', item, section },
  ]
}

/** What dropping `active` on `over` (null: on nothing) does. */
export function dropSteps(
  active: UniqueIdentifier,
  over: UniqueIdentifier | null,
  filed: Filed,
): DropStep[] {
  const section = over === null ? undefined : after(over, SECTION)
  const into = over === null ? undefined : after(over, INTO)
  const moving = after(active, SECTION)
  if (moving)
    return section
      ? [{ kind: 'move-section', section: moving, to: section }]
      : []
  if (into) return [...file(active, into, filed), ...nest(active, into, filed)]
  return section ? ontoSection(active, section, filed) : []
}

/**
 * What a screen reader calls each thing in a drag, as the panel shows it, so a
 * keyboard drag is announced by name rather than by id.
 */
export function dragNames(
  layout: SectionLayout,
  folders: readonly NoteFolder[],
  notes: readonly { readonly opens: string; readonly title: string }[],
) {
  return (id: UniqueIdentifier) => {
    const section = after(id, SECTION)
    if (section !== undefined)
      return `the ${layout.sections.find((s) => s.id === section)?.name ?? ''} section`
    const folder = after(id, 'folder:') ?? after(id, INTO)
    if (folder !== undefined) {
      const found = folders.find((f) => f.collectionId === folder)
      return found ? `the folder ${found.name}` : 'the folder'
    }
    const note = after(id, 'note:')
    if (note !== undefined) {
      const found = notes.find((n) => n.opens === note)
      return found ? `the note ${found.title}` : 'the note'
    }
    return id === AGENTS_ITEM ? 'Agent notes' : String(id)
  }
}

type Box = { readonly top: number; readonly height: number }
const middleOf = (box: Box) => box.top + box.height / 2

/**
 * How far an arrow key moves a dragged row: onto the middle of the nearest
 * place above it (up) or below it (down) that it is not already in, or nowhere.
 */
export function stepToward(
  key: string,
  dragged: Box,
  places: readonly { readonly id: UniqueIdentifier; readonly rect: Box }[],
): number | undefined {
  const sign = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0
  if (!sign) return
  const from = middleOf(dragged)
  // A place the row's middle is already in is where it is, not a step.
  const within = (box: Box) => box.top <= from && from < box.top + box.height
  const ahead = places
    .filter((place) => !within(place.rect))
    .map((place) => middleOf(place.rect) - from)
    .filter((distance) => distance * sign > 0)
  if (!ahead.length) return
  return ahead.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a))
}

/**
 * The arrow keys for a keyboard drag: a section steps as a sortable, a note or
 * a folder row steps from place to place, never onto the folder it is.
 */
export const stepKeys: KeyboardCoordinateGetter = (event, args) => {
  const sorted = sortableKeyboardCoordinates(event, args)
  if (sorted) return sorted
  const { collisionRect, droppableRects, droppableContainers } = args.context
  if (!collisionRect) return
  const self = `${INTO}${after(args.active, 'folder:') ?? ''}`
  const places = droppableContainers
    .getEnabled()
    .filter((c) => c.id !== self)
    .flatMap((c) => {
      const rect = droppableRects.get(c.id)
      return rect ? [{ id: c.id, rect }] : []
    })
  const dy = stepToward(event.code, collisionRect, places)
  if (dy === undefined) return
  event.preventDefault()
  return { x: args.currentCoordinates.x, y: args.currentCoordinates.y + dy }
}
