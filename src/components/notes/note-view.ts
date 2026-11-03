// SOURCING: zustand (which note is focused; note content stays in Theorem Documents, panel placement in the dockview layout)
import { create } from 'zustand'

/** The desktop dock, which hosts each focused note as its own panel. */
export type NoteDock = { open: (documentId: string) => void }

type NoteView = {
  /** The note the phone overlay shows; the dock tracks its own panels. */
  openId: string | undefined
  /** Set while the desktop dock is mounted. */
  dock: NoteDock | undefined
  open: (documentId: string) => void
  close: () => void
}

export const useNoteView = create<NoteView>()((set, get) => ({
  openId: undefined,
  dock: undefined,
  open: (documentId) => {
    const { dock } = get()
    if (dock) dock.open(documentId)
    else set({ openId: documentId })
  },
  close: () => set({ openId: undefined }),
}))
