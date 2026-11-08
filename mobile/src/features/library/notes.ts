// SOURCING: @theoremharness/sdk documents client (Theorem Documents v2), the calls the web client's notes use (Theorem-UI src/lib/theorem/notes.ts)
//
// Read-only for now: saving a note means writing a new canonical document,
// and the canonical encoder lives in the web client (note-canonical.ts).
import { theorem, type Theorem } from '@/lib/theorem'

const SCHEMA = 'theorem-document/2'

export async function listNotes(query: string): Promise<Theorem.DocumentSummary[]> {
  const page = await theorem().documents.list({ schema: SCHEMA, query: query || undefined, limit: 50 })
  return page.documents
}

export type NoteView = { documentId: string; title: string; markdown: string; readOnly: boolean }

export async function readNote(documentId: string): Promise<NoteView> {
  const snapshot = await theorem().documents.get({ documentId, schema: SCHEMA })
  return {
    documentId: snapshot.summary.documentId,
    title: snapshot.summary.title,
    markdown: snapshot.markdownProjection,
    readOnly: snapshot.summary.readOnly,
  }
}
