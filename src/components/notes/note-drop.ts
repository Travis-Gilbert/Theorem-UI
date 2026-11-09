// SOURCING: @dnd-kit/core (closestCenter and pointerWithin find what is under a drag); what a drop then does to the sections and folders is this panel's own
//
// What dragging in the Notes panel lands on, and what the drop does. A section
// is dragged by its heading to another's place. A row (a folder, a loose note,
// the agents' folder) is dragged into a section; a note or a folder can also
// go onto a folder, into it.
import { closestCenter, pointerWithin } from '@dnd-kit/core'
import type {
  Collision,
  CollisionDetection,
  UniqueIdentifier,
} from '@dnd-kit/core'
import { canNest } from '@/lib/theorem/note-folders'
import type { NoteFolders } from '@/lib/theorem/note-folders'
import { isSectionItem } from './note-sections'
import type { SectionId, SectionItem } from './note-sections'

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
 * only ever goes into a section.
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
  const hits = pointerWithin(filing ? args : sections)
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
    return section ? [{ kind: 'move-section', section: moving, to: section }] : []
  if (into) return [...file(active, into, filed), ...nest(active, into, filed)]
  return section ? ontoSection(active, section, filed) : []
}
