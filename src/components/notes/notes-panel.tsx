// SOURCING: @tanstack/react-router (a note is /notes/$documentId), the Pages panel's row and heading grammar, ui/input, TooltipIconButton, ui/filesystem-item (the file tree's folder row, for Agent notes), lucide Folder, the note library (Theorem Documents v2 through note-library.ts)
import { useNavigate, useParams } from '@tanstack/react-router'
import { Folder } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  FilesystemItem,
  FilesystemMarks,
} from '@/components/ui/filesystem-item'
import { Input } from '@/components/ui/input'
import { describeError } from '@/lib/theorem/client'
import { useNewNote, useNoteLibrary } from '@/lib/theorem/note-library'
import type { NoteEntry, NoteShelf } from '@/lib/theorem/note-library'

const row =
  'group relative flex h-7 w-full items-center gap-2 rounded-md px-2 text-start text-sm transition-colors duration-100 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus data-active:bg-pill data-active:shadow-pill'

const Hint = ({ children }: { children: ReactNode }) => (
  <p className="px-2 py-1 text-sm text-ink-faint-sheet">{children}</p>
)

/** The navigator in Notes mode: the person's notes, the ones agents wrote, and the Trash. */
export function NotesPanel() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [shelf, setShelf] = useState<'notes' | 'trash'>('notes')
  const create = useNewNote()
  const newNote = () =>
    create.mutate(undefined, {
      onSuccess: (note) => {
        setShelf('notes')
        void navigate({
          to: '/notes/$documentId',
          params: { documentId: note.documentId },
        })
      },
    })
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 px-3">
        <p className="min-w-0 flex-1 font-heading text-[15px] font-medium">
          {shelf === 'trash' ? 'Trash' : 'Notes'}
        </p>
        <TooltipIconButton
          tooltip="New note"
          className="size-7 p-1.5"
          disabled={create.isPending}
          onClick={newNote}
        >
          <Icon.Add className="size-4" />
        </TooltipIconButton>
      </div>
      <div className="px-3 pb-2">
        <Input
          aria-label={shelf === 'trash' ? 'Search the Trash' : 'Search notes'}
          placeholder="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {create.error && (
        <p role="alert" className="px-4 pb-2 text-xs text-error-ink">
          {describeError(create.error, 'document')}
        </p>
      )}
      <nav
        aria-label={shelf === 'trash' ? 'Trash' : 'Notes'}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
      >
        <NoteList query={query} shelf={shelf} />
        {shelf === 'notes' && <AgentNotes query={query} />}
      </nav>
      <div className="shrink-0 border-t border-separator px-2 py-2">
        <button
          type="button"
          className={row}
          aria-pressed={shelf === 'trash'}
          data-active={shelf === 'trash' || undefined}
          onClick={() => setShelf(shelf === 'trash' ? 'notes' : 'trash')}
        >
          {shelf === 'trash' ? (
            <Icon.Notes className="size-4 shrink-0 text-ink-faint" />
          ) : (
            <Icon.Delete className="size-4 shrink-0 text-ink-faint" />
          )}
          <span className="min-w-0 flex-1 truncate">
            {shelf === 'trash' ? 'Back to notes' : 'Trash'}
          </span>
        </button>
      </div>
    </div>
  )
}

const emptyShelf: Record<NoteShelf, string> = {
  notes: 'No notes yet. Start one with the plus.',
  agent: 'No agent has written a note yet.',
  trash: 'The Trash is empty.',
}

/**
 * The folder of what agents wrote to their memory, after the person's own
 * notes. Its colour is the complement of the person's folders.
 */
function AgentNotes({ query }: { query: string }) {
  const [open, setOpen] = useState(false)
  return (
    <FilesystemItem
      open={open}
      row={
        <button
          type="button"
          className={`${row} mt-1 gap-1 ps-1`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <FilesystemMarks
            folder
            open={open}
            icon={
              <Folder
                aria-hidden="true"
                className="size-4 shrink-0 fill-folder-agent text-folder-agent"
              />
            }
          />
          <span className="min-w-0 flex-1 truncate">Agent notes</span>
        </button>
      }
    >
      <div className="ps-5">
        <NoteList query={query} shelf="agent" />
      </div>
    </FilesystemItem>
  )
}

function NoteList({ query, shelf }: { query: string; shelf: NoteShelf }) {
  const library = useNoteLibrary(query, shelf)
  if (library.isPending) return <Hint>Loading notes…</Hint>
  if (library.isError)
    return <Hint>{describeError(library.error, 'document')}</Hint>
  if (!library.data.length)
    return <Hint>{query.trim() ? 'Nothing matches.' : emptyShelf[shelf]}</Hint>
  return (
    <>
      <ul className="flex flex-col">
        {library.data.map((entry) => (
          <NoteRow key={entry.documentId} entry={entry} />
        ))}
      </ul>
      {library.hasNextPage && (
        <Button
          variant="ghost"
          size="xs"
          className="mt-1 w-full"
          disabled={library.isFetchingNextPage}
          onClick={() => void library.fetchNextPage()}
        >
          {library.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </Button>
      )}
    </>
  )
}

function NoteRow({ entry }: { entry: NoteEntry }) {
  const navigate = useNavigate()
  const { documentId } = useParams({ strict: false })
  const active = documentId === entry.opens
  return (
    <li>
      <button
        type="button"
        className={row}
        data-active={active || undefined}
        aria-current={active ? 'page' : undefined}
        onClick={() =>
          void navigate({
            to: '/notes/$documentId',
            params: { documentId: entry.opens },
          })
        }
      >
        <span className="min-w-0 flex-1 truncate">{entry.title}</span>
      </button>
    </li>
  )
}
