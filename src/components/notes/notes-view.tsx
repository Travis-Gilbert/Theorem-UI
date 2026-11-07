// SOURCING: NotePanel (the Milkdown note at full size), ui/button, @tanstack/react-router (the open note is the route's documentId), the note library's mutations (Theorem Documents v2: create, retire, restore, promote)
import { useNavigate, useParams } from '@tanstack/react-router'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import {
  noteEntry,
  useNewNote,
  useNoteLifecycle,
  usePromoteNote,
} from '@/lib/theorem/note-library'
import { useNote } from '@/lib/theorem/notes'
import type { Note } from '@/lib/theorem/notes'
import { NotePanel } from './note-panel'

/** Notes mode's main view: the open note, or a way to start one. */
export function NotesView() {
  const { documentId } = useParams({ strict: false })
  return documentId ? (
    <OpenNote key={documentId} documentId={documentId} />
  ) : (
    <NoNoteOpen />
  )
}

function NoNoteOpen() {
  const navigate = useNavigate()
  const create = useNewNote()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-heading text-[20px] font-medium">Notes</p>
      <p className="max-w-md text-sm text-ink-muted">
        Notes are Theorem documents. What you write here, and what agents encode
        from their memory, is kept in the graph.
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={create.isPending}
        onClick={() =>
          create.mutate(undefined, {
            onSuccess: (note) =>
              void navigate({
                to: '/notes/$documentId',
                params: { documentId: note.documentId },
              }),
          })
        }
      >
        <Icon.Add />
        New note
      </Button>
      {create.error && (
        <p role="alert" className="text-sm text-error-ink">
          {describeError(create.error, 'document')}
        </p>
      )}
    </div>
  )
}

function OpenNote({ documentId }: { documentId: string }) {
  const note = useNote(documentId)
  return (
    <NotePanel
      documentId={documentId}
      actions={note.data && <NoteActions note={note.data} />}
      readOnlyNotice={note.data && <ReadOnlyNotice note={note.data} />}
    />
  )
}

/** Trash or Restore. Agent memory is never trashed through the document product. */
function NoteActions({ note }: { note: Note }) {
  const navigate = useNavigate()
  const lifecycle = useNoteLifecycle()
  if (noteEntry(note).source === 'encoded') return null
  const action = note.retired ? 'restore' : 'retire'
  return (
    <>
      {lifecycle.error && (
        <span role="alert" className="truncate text-xs text-error-ink">
          {describeError(lifecycle.error, 'document')}
        </span>
      )}
      <Button
        variant="ghost"
        size="xs"
        disabled={lifecycle.isPending}
        onClick={() =>
          lifecycle.mutate(
            { action, documentId: note.documentId },
            {
              onSuccess: () => {
                if (action === 'retire') void navigate({ to: '/notes' })
              },
            },
          )
        }
      >
        {note.retired ? (
          <>
            <Icon.Undo />
            Restore
          </>
        ) : (
          <>
            <Icon.Delete />
            Move to Trash
          </>
        )}
      </Button>
    </>
  )
}

function ReadOnlyNotice({ note }: { note: Note }) {
  const navigate = useNavigate()
  const promote = usePromoteNote()
  const { promotion } = noteEntry(note)
  if (note.retired) return <span>In the Trash. Restore it to edit it.</span>
  if (!promotion) return undefined
  return (
    <>
      <span className="me-auto">
        An agent wrote this from its memory. Make an editable copy to change it.
      </span>
      {promote.error && (
        <span role="alert" className="text-error-ink">
          {describeError(promote.error, 'document')}
        </span>
      )}
      <Button
        variant="outline"
        size="xs"
        disabled={promote.isPending}
        onClick={() =>
          promote.mutate(
            { ...promotion, title: note.title },
            {
              onSuccess: ({ promotedDocument }) =>
                void navigate({
                  to: '/notes/$documentId',
                  params: { documentId: promotedDocument.documentId },
                }),
            },
          )
        }
      >
        Make editable
      </Button>
    </>
  )
}
