// SOURCING: NotePanel (the Milkdown note at full size), ui/button, Base UI Menu (Move to, the way the project switcher picks one of several), @tanstack/react-router (the open note is the route's documentId), the note library's mutations (Theorem Documents v2: create, retire, restore, promote), the note folders (Theorem's document collections)
import { Menu } from '@base-ui/react/menu'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Folder } from 'lucide-react'
import { Icon } from '@/components/icons'
import { menuItem, menuPopup } from '@/components/shell/sidebar'
import { Button, buttonVariants } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import { useMoveNote, useNoteFolders } from '@/lib/theorem/note-folders'
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
        <Icon.NewNote />
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
      {!note.retired && <MoveToFolder documentId={note.documentId} />}
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

const TOP_LEVEL = ''

/** Move the open note into a folder or out to the top level, without dragging. */
function MoveToFolder({ documentId }: { documentId: string }) {
  const folders = useNoteFolders()
  const move = useMoveNote()
  if (!folders.data?.folders.length) return null
  const { folderOf } = folders.data
  const current = folderOf.get(documentId) ?? TOP_LEVEL
  const options = [
    { value: TOP_LEVEL, name: 'No folder' },
    ...folders.data.folders.map((folder) => ({
      value: folder.collectionId,
      name: folder.name,
    })),
  ]
  return (
    <>
      {move.error && (
        <span role="alert" className="truncate text-xs text-error-ink">
          {describeError(move.error, 'document')}
        </span>
      )}
      <Menu.Root>
        <Menu.Trigger
          className={buttonVariants({ variant: 'ghost', size: 'xs' })}
          disabled={move.isPending}
        >
          <Folder aria-hidden="true" />
          Move to
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            side="bottom"
            align="end"
            sideOffset={4}
            className="z-50"
          >
            <Menu.Popup className={`min-w-44 ${menuPopup}`}>
              <Menu.RadioGroup
                value={current}
                onValueChange={(value) => {
                  if (value === current) return
                  move.mutate({
                    documentId,
                    to: value === TOP_LEVEL ? null : String(value),
                  })
                }}
              >
                {options.map((option) => (
                  <Menu.RadioItem
                    key={option.value || 'top-level'}
                    value={option.value}
                    closeOnClick
                    className={`${menuItem} data-checked:font-medium`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {option.name}
                    </span>
                    <Menu.RadioItemIndicator>
                      <Icon.Check className="size-3.5" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
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
