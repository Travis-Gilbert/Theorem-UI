// SOURCING: zustand subscriptions to the note save status (notes.ts) and the
// open text files' drafts (file-sync.ts), reported through the desktop host's
// bridge (setDocumentEdited, the leaving event). The quit handshake itself is
// the host's: desktop/src/bridge.rs.
import { flushTextFiles, useUnsavedFiles } from '@/lib/handlers/file-sync'
import { leavePage, useNoteStatus } from '@/lib/theorem/notes'
import type { DesktopHost } from './host'

const unsaved = () =>
  Object.values(useNoteStatus.getState().status).some(
    (status) => status !== 'saved',
  ) || useUnsavedFiles.getState().unsaved

/**
 * Keeps the window's edited mark on while a note or a file has edits the
 * server or the disk does not have, and saves them at once when the person
 * quits. The first report tells the host this page answers when it quits:
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
