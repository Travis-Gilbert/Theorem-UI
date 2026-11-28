// SOURCING: @tanstack/react-query's useQueries (each App's form, read through the note cache notes.ts already keeps), note-canonical for a saved artifact's form; the paged reads themselves live in scoped.ts
//
// Every object Notes shows, whatever owns it: a Documents v2 document for the
// standard library's Page, App and Notebook, a register record for any other
// class. One entry shape, so Library, the inspector and the graph treat a
// person's own class exactly as they treat Pages.
import { useQueries } from '@tanstack/react-query'
import type { RecordRow } from '@/components/records/contract'
import type { Theorem } from '@/lib/theorem/client'
import { noteAttribute } from '@/lib/theorem/note-canonical'
import { APP_KIND, fetchNote, noteKey } from '@/lib/theorem/notes'
import type { Note } from '@/lib/theorem/notes'
import type { ObjectClass } from './classes'

/**
 * How an object is named wherever Notes keeps a reference to it: a document
 * by its id, a record as `record:<class name>/<id>` (records/model).
 */
export type ObjectRef = string

/** Who made an object, as a table cell and as the inspector says it. */
export const ORIGIN_SHORT = {
  authored: 'You',
  encoded: 'Agent',
  unknown: 'Unknown',
} as const
export const ORIGIN_LONG = {
  authored: 'You',
  encoded: 'An agent, from memory',
  unknown: 'Not recorded',
} as const

export type ObjectEntry = {
  ref: ObjectRef
  cls: ObjectClass
  title: string
  /** The document a pane opens, for an object a Documents owner holds. */
  documentId?: string
  record?: RecordRow
  /** Theorem's history position of the last change, for sorting. */
  updated?: number
  created?: number
  /**
   * Who made it: a person, an agent encoding from memory, or not recorded.
   * A register record carries no author, so it says unknown.
   */
  origin: 'authored' | 'encoded' | 'unknown'
  /** Who touched it, from where, and in which run. */
  actors?: Theorem.ActorProvenance[]
  /** Runs that wrote it, for provenance between objects made together. */
  runs?: string[]
  /** The memory document an encoded object was made from. */
  encodedFrom?: string
  /** The document an encoded object was promoted into. */
  promotedTo?: string
}

/** A saved artifact's form, read from the source block (apps.ts FORM_ATTR). */
export const artifactForm = (note: Pick<Note, 'canonical'>) =>
  (note.canonical && noteAttribute(note.canonical, 'artifactForm')) ||
  'html-app'

export const SCHEMA = 'theorem-document/2'

// Module level, so TanStack keeps the combined result while the notes stay the same.
const formsOf = (results: { data?: Note; isPending: boolean }[]) => ({
  forms: new Map(
    results.flatMap((result) =>
      result.data
        ? [[result.data.documentId, artifactForm(result.data)] as const]
        : [],
    ),
  ),
  pending: results.some((result) => result.isPending),
})

/** The form of each saved App, read through the note cache a pane shares. */
export function useArtifactForms(summaries: Theorem.DocumentSummary[]) {
  const apps = summaries.filter((s) => s.documentKind === APP_KIND)
  return useQueries({
    queries: apps.map((summary) => ({
      queryKey: noteKey(summary.documentId),
      queryFn: () => fetchNote(summary.documentId),
      staleTime: 60_000,
    })),
    combine: formsOf,
  })
}

export const documentEntry = (
  summary: Theorem.DocumentSummary,
  cls: ObjectClass,
): ObjectEntry => ({
  ref: summary.documentId,
  cls,
  title: summary.title.trim() || `Untitled ${cls.label.toLowerCase()}`,
  documentId: summary.documentId,
  updated: Number(summary.updatedPosition),
  created: Number(summary.createdPosition),
  origin: summary.origin.kind === 'agent_encoded' ? 'encoded' : 'authored',
  actors: summary.actors,
  runs: [
    ...new Set(
      summary.actors.flatMap((actor) => (actor.runId ? [actor.runId] : [])),
    ),
  ],
  ...(summary.origin.kind === 'agent_encoded'
    ? {
        encodedFrom: summary.origin.sourceMemoryDocId,
        promotedTo: summary.origin.promotedDocumentId,
      }
    : {}),
})

/** Newest change first; objects without a history position keep their order. */
export const byUpdated = (a: ObjectEntry, b: ObjectEntry) =>
  (b.updated ?? -1) - (a.updated ?? -1)
