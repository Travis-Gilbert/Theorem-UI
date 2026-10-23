// SOURCING: @theoremharness/sdk documents client (Theorem Documents v2), @tanstack/react-query (note server state), zustand (save status)
//
// Notes are Theorem documents whose Markdown projection is the note. Every
// editor of a document (a canvas card, the focused panel) writes through the
// one query-cache entry and the one save queue here, so two views of a note
// never race each other.
import { useQuery } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { hasStatus, mutate, theorem } from './client'
import type { Theorem } from './client'
import {
  contentDigest,
  encodeNote,
  isEditableNote,
  mergeNote,
  reviseNote,
} from './note-canonical'

const SCHEMA = 'theorem-document/2'
const KIND = 'authored'
const SAVE_DELAY_MS = 800
/** Saves that merge with a newer revision before the note reports a conflict. */
const MERGE_ATTEMPTS = 3

export type Note = {
  documentId: string
  title: string
  /** The latest local Markdown, saved or not. */
  markdown: string
  /** The Markdown at `revision`. */
  savedMarkdown: string
  revision: Theorem.DocumentRevision
  /** Canonical snapshot at `revision`; undefined when the server holds it as an artifact. */
  canonical: Uint8Array | undefined
  /** False for read-only documents and for block layouts other than one Markdown paragraph. */
  editable: boolean
}

export const noteKey = (documentId: string) =>
  ['theorem', 'note', documentId] as const

const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
const toBase64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))

/** A note's title: its first line without heading marks. */
export function titleOf(markdown: string): string {
  const line = markdown
    .split('\n')
    .map((l) => l.replace(/^#{1,6}\s+/, '').trim())
    .find(Boolean)
  return line ? line.slice(0, 120) : 'Untitled note'
}

function toNote(snapshot: Theorem.DocumentSnapshot): Note {
  const canonical =
    snapshot.canonical.placement === 'inline'
      ? fromBase64(snapshot.canonical.bytesBase64)
      : undefined
  return {
    documentId: snapshot.summary.documentId,
    title: snapshot.summary.title,
    markdown: snapshot.markdownProjection,
    savedMarkdown: snapshot.markdownProjection,
    revision: snapshot.summary.revision,
    canonical,
    editable:
      !snapshot.summary.readOnly &&
      canonical !== undefined &&
      isEditableNote(canonical),
  }
}

export async function fetchNote(documentId: string): Promise<Note> {
  return toNote(await theorem().documents.get({ documentId, schema: SCHEMA }))
}

async function writeBody(
  canonical: Uint8Array,
  markdown: string,
): Promise<Theorem.DocumentWriteBody> {
  return {
    title: titleOf(markdown),
    documentKind: KIND,
    canonical: {
      placement: 'inline',
      bytesBase64: toBase64(canonical),
      size: canonical.length,
      digest: await contentDigest(canonical),
    },
    markdownProjection: markdown,
  }
}

export async function createNote(markdown: string): Promise<Note> {
  const canonical = encodeNote(markdown)
  const body = await writeBody(canonical, markdown)
  const { document } = await mutate((headers) =>
    theorem().documents.create({
      ...headers,
      schema: SCHEMA,
      idempotencyKey: headers['Idempotency-Key'],
      body,
    }),
  )
  return {
    documentId: document.documentId,
    title: document.title,
    markdown,
    savedMarkdown: markdown,
    revision: document.revision,
    canonical,
    editable: true,
  }
}

async function revise(
  documentId: string,
  revision: Theorem.DocumentRevision,
  canonical: Uint8Array,
  markdown: string,
): Promise<Theorem.DocumentSummary> {
  const body = await writeBody(canonical, markdown)
  const { document } = await mutate((headers) =>
    theorem().documents.revise({
      ...headers,
      'If-Match': String(revision.position),
      documentIdPath: documentId,
      documentId,
      schema: SCHEMA,
      idempotencyKey: headers['Idempotency-Key'],
      expectedRevision: revision,
      body,
    }),
  )
  return document
}

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'conflict' | 'error'

export const useNoteStatus = create<{
  status: Readonly<Record<string, SaveStatus>>
  set: (documentId: string, status: SaveStatus) => void
}>()((set) => ({
  status: {},
  set: (documentId, status) =>
    set((s) => ({ status: { ...s.status, [documentId]: status } })),
}))

const setStatus = (documentId: string, status: SaveStatus) =>
  useNoteStatus.getState().set(documentId, status)

/**
 * Save the cached note's latest Markdown. A stale revision fetches the newer
 * one and merges through Loro, up to MERGE_ATTEMPTS times; the merged text
 * goes back into the cache, so every open editor shows it.
 */
async function save(queryClient: QueryClient, documentId: string) {
  const key = noteKey(documentId)
  const note = queryClient.getQueryData<Note>(key)
  if (!note?.canonical || !note.editable) return
  if (note.markdown === note.savedMarkdown)
    return setStatus(documentId, 'saved')
  setStatus(documentId, 'saving')
  const typed = note.markdown
  // The local revision. Merges start from it, so its operations are the ones
  // the server keeps, and text typed during this save can merge onto the result.
  const local = reviseNote(note.canonical, typed)
  let { revision } = note
  let markdown = typed
  let canonical = local
  for (let attempt = 0; ; attempt++) {
    try {
      const summary = await revise(documentId, revision, canonical, markdown)
      const sent = markdown
      const saved = canonical
      queryClient.setQueryData<Note>(key, (current) =>
        current
          ? {
              ...current,
              title: summary.title,
              revision: summary.revision,
              canonical: saved,
              savedMarkdown: sent,
              // Text typed during the save stays; its own save is queued.
              markdown:
                current.markdown === typed
                  ? sent
                  : sent === typed
                    ? current.markdown
                    : (mergeNote(local, current.markdown, saved)?.markdown ??
                      current.markdown),
            }
          : current,
      )
      const after = queryClient.getQueryData<Note>(key)
      setStatus(
        documentId,
        after && after.markdown !== after.savedMarkdown ? 'pending' : 'saved',
      )
      return
    } catch (error) {
      if (!hasStatus(error, 409, 412) || attempt + 1 >= MERGE_ATTEMPTS) {
        setStatus(documentId, hasStatus(error, 409, 412) ? 'conflict' : 'error')
        throw error
      }
      const remote = await fetchNote(documentId)
      const merged =
        remote.canonical && mergeNote(local, typed, remote.canonical)
      if (!merged) {
        setStatus(documentId, 'conflict')
        return
      }
      revision = remote.revision
      canonical = merged.canonical
      markdown = merged.markdown
    }
  }
}

type SaveQueue = {
  timer?: ReturnType<typeof setTimeout>
  chain: Promise<void>
  /** Starts the note's save now instead of after SAVE_DELAY_MS. */
  start: () => void
}

const queues = new Map<string, SaveQueue>()

/** Record an edit in the shared cache and schedule its save. */
export function editNote(
  queryClient: QueryClient,
  documentId: string,
  markdown: string,
) {
  const key = noteKey(documentId)
  const note = queryClient.getQueryData<Note>(key)
  if (!note || note.markdown === markdown) return
  queryClient.setQueryData<Note>(key, { ...note, markdown })
  setStatus(documentId, 'pending')
  watchLeaving()
  let queue = queues.get(documentId)
  if (!queue) {
    const created: SaveQueue = {
      chain: Promise.resolve(),
      start: () => {
        clearTimeout(created.timer)
        created.timer = undefined
        created.chain = created.chain
          .then(() => save(queryClient, documentId))
          .catch(() => undefined)
      },
    }
    queue = created
    queues.set(documentId, queue)
  }
  clearTimeout(queue.timer)
  if (document.visibilityState === 'hidden') queue.start()
  else queue.timer = setTimeout(queue.start, SAVE_DELAY_MS)
}

/**
 * For a page that is going away: a hidden page may never come back, so its
 * scheduled saves start now, and unloading while a save is unfinished asks
 * first, as browsers do for edited forms. Editors call this after handing
 * over their last text.
 */
export function leavePage(event?: Event) {
  for (const queue of queues.values())
    if (queue.timer !== undefined) queue.start()
  const unsaved = Object.values(useNoteStatus.getState().status).some(
    (status) => status === 'pending' || status === 'saving',
  )
  if (unsaved && event?.type === 'beforeunload') event.preventDefault()
}

let watching = false

/** Edits saved after an editor closed still need leavePage. */
function watchLeaving() {
  if (watching) return
  watching = true
  window.addEventListener('beforeunload', leavePage)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leavePage()
  })
}

/** Drop local edits after a conflict and take the server's revision. */
export async function reloadNote(queryClient: QueryClient, documentId: string) {
  queryClient.setQueryData(noteKey(documentId), await fetchNote(documentId))
  setStatus(documentId, 'saved')
}

/** Seed the cache with a note this client just created. */
export function primeNote(queryClient: QueryClient, note: Note) {
  queryClient.setQueryData(noteKey(note.documentId), note)
}

export function useNote(documentId: string) {
  return useQuery({
    queryKey: noteKey(documentId),
    queryFn: () => fetchNote(documentId),
    // Local edits live in this entry; a refetch would drop unsaved text.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

export function useNoteSearch(query: string) {
  return useQuery({
    queryKey: ['theorem', 'notes', 'search', query],
    queryFn: async () =>
      (
        await theorem().documents.list({
          schema: SCHEMA,
          query: query.trim() || undefined,
          limit: 20,
        })
      ).documents,
    staleTime: 10_000,
  })
}
