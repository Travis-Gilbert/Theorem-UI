// SOURCING: the notes workspace (dockview panes, notes-workspace.tsx), OpenNote and NoNoteOpen (open-note.tsx), @tanstack/react-router (the open note is the route's documentId)
import { useNavigate, useParams } from '@tanstack/react-router'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { ObjectLibrary } from '@/components/objects/object-library'
import { PhonePane } from '@/components/objects/object-panes'
import { NotesWorkspace } from './notes-workspace'
import { useNotesWorkspace } from './notes-workspace-state'
import { OpenNote } from './open-note'

/**
 * Notes mode's main view. On the desktop it is a workspace of panes, each an
 * open note, that you split, drag and close; on a phone, the open note, or the library.
 * Either way a note is the route's, or there is a way to start one.
 */
export function NotesView({
  docked = false,
  actions,
}: {
  docked?: boolean
  /** The shell's panel controls, for the workspace's top-right pane. */
  actions?: ReactNode
}) {
  const { documentId } = useParams({ strict: false })
  const phone = useNotesWorkspace((s) => s.phone)
  const navigate = useNavigate()
  // On a phone, opening a library, object or graph takes the place of the open note, or the library.
  useEffect(() => {
    if (phone && !docked) void navigate({ to: '/notes' })
  }, [phone, docked, navigate])
  if (docked) return <NotesWorkspace actions={actions} />
  if (documentId) return <OpenNote key={documentId} documentId={documentId} />
  return phone ? <PhonePane spec={phone} /> : <ObjectLibrary scope="all" />
}
