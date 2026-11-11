// SOURCING: Intl.Collator (the platform's own way to compare titles as a person reads them); the rest is the order rule, which nothing upstream models
//
// The orders the Notes panel can list notes in. Theorem lists documents by
// their last edit and has no other order, so any other order is taken here,
// over every page.
import type { Theorem } from './client'
import type { NoteEntry } from './note-library'

/** A listed note: its row, and where it stands in Theorem's history. */
export type ListedNote = NoteEntry &
  Pick<Theorem.DocumentSummary, 'createdPosition' | 'updatedPosition'>

export type NoteOrder = 'edited' | 'created' | 'title'

/** The orders, in the menu's order; the first is Theorem's own. */
export const NOTE_ORDERS: readonly { order: NoteOrder; label: string }[] = [
  { order: 'edited', label: 'Recently edited' },
  { order: 'created', label: 'Date created' },
  { order: 'title', label: 'A to Z' },
]

const titles = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
})

/** Ascending, for positions (a number or a bigint) and ids alike. */
const ascending = <TValue extends number | bigint | string>(
  a: TValue,
  b: TValue,
) => (a < b ? -1 : a > b ? 1 : 0)

const compare: Record<NoteOrder, (a: ListedNote, b: ListedNote) => number> = {
  edited: (a, b) => ascending(b.updatedPosition, a.updatedPosition),
  created: (a, b) => ascending(b.createdPosition, a.createdPosition),
  title: (a, b) => titles.compare(a.title, b.title),
}

/** The notes in an order, ties broken by id so the list never shuffles. */
export const sortNotes = <T extends ListedNote>(
  notes: readonly T[],
  order: NoteOrder,
): T[] =>
  [...notes].sort(
    (a, b) => compare[order](a, b) || ascending(a.documentId, b.documentId),
  )

/** Whether the order can be right only once every page is read. */
export const needsEveryPage = (order: NoteOrder) => order !== 'edited'
