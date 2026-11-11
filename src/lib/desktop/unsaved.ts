// SOURCING: zustand subscriptions to the note save status (notes.ts), the
// open text files' drafts (file-sync.ts) and pages' unsaved arrangements
// (modules/drafts.ts), reported through the desktop host's
// bridge (setDocumentEdited, the leaving event). The quit handshake itself is
// the host's: desktop/src/bridge.rs.
import { flushTextFiles, useUnsavedFiles } from '@/lib/handlers/file-sync'
import { pagesUnsaved, usePageDrafts } from '@/lib/modules/drafts'
import { leavePage, useNoteStatus } from '@/lib/theorem/notes'
import type { DesktopHost } from './host'

const unsaved = () =>
  Object.values(useNoteStatus.getState().status).some(
    (status) => status !== 'saved',
  ) ||
  useUnsavedFiles.getState().unsaved ||
  pagesUnsaved()

/**
 * Keeps the window's edited mark on while a note, a file or a page has edits
 * the server or the vault does not have, and saves notes and files at once
 * when the person quits. A page is saved only by the person, so its
 * arrangement keeps the mark on and the host asks. The first report tells the host this page answers when it quits:
 * the host then waits for the mark to go off, and asks the person when it
 * stays on. Returns the function that stops it.
 */
export function reportUnsaved(host: DesktopHost): () => void {
  let edited: boolean | undefined
  const update = () => {
    const next = unsaved()
    if (next === edited) return
    edited = next
    void host.setDocumentEdited(next)
  }
  const stops = [
    useNoteStatus.subscribe(update),
    useUnsavedFiles.subscribe(update),
    usePageDrafts.subscribe(update),
    host.onEvent((event) => {
      if (event.type !== 'leaving') return
      leavePage()
      flushTextFiles()
      // With nothing left to save, the host still waits for an answer.
      if (!edited) void host.setDocumentEdited(false)
    }),
  ]
  update()
  return () => {
    for (const stop of stops) stop()
  }
}
