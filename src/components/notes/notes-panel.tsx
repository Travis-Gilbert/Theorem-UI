// SOURCING: @tanstack/react-router (a note is /notes/$documentId), the Pages panel's row and heading grammar, Base UI Toolbar (the panel's tools, with arrow keys between them) and Menu (the sort menu), ThreadListSearch (the search that springs open, as in the Index and the threads), TooltipIconButton, ui/filesystem-item (the file tree's folder row, for the folders and Agent notes), lucide Folder and FolderPlus, @dnd-kit/core (a note dragged onto a folder; already used by the data table), the note library and folders (Theorem Documents v2 and its collections, through note-library.ts and note-folders.ts)
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Menu } from '@base-ui/react/menu'
import { Toolbar } from '@base-ui/react/toolbar'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Folder, FolderPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ThreadListSearch } from '@/components/assistant-ui/elements/thread-list.aui'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  FilesystemItem,
  FilesystemMarks,
} from '@/components/ui/filesystem-item'
import { menuItem, menuPopup } from '@/components/shell/sidebar'
import { useShell } from '@/components/shell/shell-state'
import { describeError } from '@/lib/theorem/client'
import {
  folderName,
  placeNotes,
  useMoveNote,
  useNewFolder,
  useNoteFolders,
} from '@/lib/theorem/note-folders'
import type { NoteFolder } from '@/lib/theorem/note-folders'
import {
  noteMark,
  useNewNote,
  useNoteLibrary,
} from '@/lib/theorem/note-library'
import type { NoteEntry, NoteMark, NoteShelf } from '@/lib/theorem/note-library'
import { NOTE_ORDERS } from '@/lib/theorem/note-order'
import type { NoteOrder } from '@/lib/theorem/note-order'
import { sectionName } from './note-sections'
import type { NoteSection } from './note-sections'
import { useNote, useNoteStatus } from '@/lib/theorem/notes'
import { cn } from '@/lib/utils'

const row =
  'group relative flex h-7 w-full items-center gap-2 rounded-md px-2 text-start text-sm transition-colors duration-100 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus data-active:bg-pill data-active:shadow-pill'

const Hint = ({ children }: { children: ReactNode }) => (
  <p className="px-2 py-1 text-sm text-ink-faint-sheet">{children}</p>
)

/**
 * The navigator in Notes mode: the open note's name, the tools, the person's
 * folders and notes, the ones agents wrote, and the Trash.
 */
export function NotesPanel() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [shelf, setShelf] = useState<'notes' | 'trash'>('notes')
  const [naming, setNaming] = useState(false)
  const order = useShell((state) => state.noteOrder)
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
      <div className="flex h-12 shrink-0 items-center px-3">
        <PanelTitle shelf={shelf} />
      </div>
      <Toolbar.Root
        aria-label="Notes tools"
        className="flex shrink-0 items-center gap-0.5 px-2 pb-2"
      >
        <Toolbar.Button
          render={
            <TooltipIconButton
              tooltip="New note"
              className="size-7 p-1.5"
              disabled={create.isPending}
              onClick={newNote}
            />
          }
        >
          <Icon.NewNote className="size-4" />
        </Toolbar.Button>
        <Toolbar.Button
          render={
            <TooltipIconButton
              tooltip="New folder"
              className="size-7 p-1.5"
              onClick={() => {
                setShelf('notes')
                setNaming(true)
              }}
            />
          }
        >
          <FolderPlus aria-hidden="true" className="size-4" />
        </Toolbar.Button>
        <SortMenu order={order} />
        <div className="min-w-0 flex-1">
          <Toolbar.Input
            render={
              <ThreadListSearch
                value={query}
                onValueChange={setQuery}
                aria-label={
                  shelf === 'trash' ? 'Search the Trash' : 'Search notes'
                }
                placeholder={
                  shelf === 'trash' ? 'Search the Trash' : 'Search notes'
                }
              />
            }
          />
        </div>
      </Toolbar.Root>
      {create.error && (
        <p role="alert" className="px-4 pb-2 text-xs text-error-ink">
          {describeError(create.error, 'document')}
        </p>
      )}
      <nav
        aria-label={shelf === 'trash' ? 'Trash' : 'Notes'}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
      >
        {shelf === 'notes' ? (
          <>
            <NotesTree
              query={query}
              order={order}
              newFolder={
                naming && <NewFolder onDone={() => setNaming(false)} />
              }
            />
            <SectionHeader section="agents" />
            <AgentNotes query={query} order={order} />
          </>
        ) : (
          <NoteList query={query} shelf="trash" order={order} />
        )}
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

const titleClass =
  'min-w-0 flex-1 truncate font-heading text-[15px] font-medium'

/** The open note's name, or the shelf's when no note is open. */
function PanelTitle({ shelf }: { shelf: 'notes' | 'trash' }) {
  const { documentId } = useParams({ strict: false })
  const fallback = shelf === 'trash' ? 'Trash' : 'Notes'
  return documentId ? (
    <OpenNoteTitle documentId={documentId} fallback={fallback} />
  ) : (
    <p className={titleClass}>{fallback}</p>
  )
}

/** Follows the note as it is written: its title is its first line. */
function OpenNoteTitle({
  documentId,
  fallback,
}: {
  documentId: string
  fallback: string
}) {
  const title = useNote(documentId).data?.title ?? fallback
  return (
    <p className={titleClass} title={title} data-slot="notes-panel-title">
      {title}
    </p>
  )
}

/** How the notes are listed; the choice is kept for the next visit. */
function SortMenu({ order }: { order: NoteOrder }) {
  const setOrder = useShell((state) => state.setNoteOrder)
  return (
    <Menu.Root>
      <Toolbar.Button
        render={
          <Menu.Trigger
            render={
              <TooltipIconButton tooltip="Sort" className="size-7 p-1.5" />
            }
          />
        }
      >
        <Icon.Sort className="size-4" />
      </Toolbar.Button>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="start"
          sideOffset={4}
          className="z-50"
        >
          <Menu.Popup className={`min-w-44 ${menuPopup}`}>
            <Menu.Group>
              <Menu.GroupLabel className="px-2 py-1 text-xs text-ink-faint">
                Sort by
              </Menu.GroupLabel>
              <Menu.RadioGroup
                value={order}
                onValueChange={(value: NoteOrder) => setOrder(value)}
              >
                {NOTE_ORDERS.map((option) => (
                  <Menu.RadioItem
                    key={option.order}
                    value={option.order}
                    closeOnClick
                    className={`${menuItem} data-checked:font-medium`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                    <Menu.RadioItemIndicator>
                      <Icon.Check className="size-3.5" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

const emptyShelf: Record<NoteShelf, string> = {
  notes: 'No notes yet. Start one with New note.',
  agent: 'No agent has written a note yet.',
  trash: 'The Trash is empty.',
}

/** Where a note dropped outside every folder goes: the top level. */
const TOP_LEVEL = 'top-level'

/**
 * The person's folders, then their loose notes. A note dragged onto a folder
 * moves into it, and dragged onto the loose notes moves out to the top level.
 */
function NotesTree({
  query,
  order,
  newFolder,
}: {
  query: string
  order: NoteOrder
  /** The field naming a new folder, while there is one. */
  newFolder: ReactNode
}) {
  const library = useNoteLibrary(query, 'notes', order)
  const folders = useNoteFolders()
  const move = useMoveNote()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )
  const folderOf = folders.data?.folderOf
  const notes = library.data
  // A folder lists the notes of the pages already read; read on until it has them all.
  const unread =
    !!folderOf &&
    !!notes &&
    [...folderOf.keys()].some((id) => !notes.some((note) => note.opens === id))
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = library
  useEffect(() => {
    if (unread && hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [unread, hasNextPage, isFetchingNextPage, fetchNextPage])

  if (library.isPending || folders.isPending) return <Hint>Loading notes…</Hint>
  if (library.isError)
    return <Hint>{describeError(library.error, 'document')}</Hint>
  // Without its folders the list still shows every note, loose.
  const filed = folders.data ?? {
    folders: [],
    folderOf: new Map<string, string>(),
  }
  const { loose, inFolder } = placeNotes(library.data, filed.folderOf)
  const searching = Boolean(query.trim())
  const shown = filed.folders.filter(
    (folder) => !searching || inFolder(folder.collectionId).length > 0,
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return
    const documentId = String(active.id)
    const to = over.id === TOP_LEVEL ? null : String(over.id)
    if ((filed.folderOf.get(documentId) ?? null) === to) return
    move.mutate({ documentId, to })
  }
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {folders.isError && (
        <p role="alert" className="px-2 pb-1 text-xs text-error-ink">
          {describeError(folders.error, 'document')}
        </p>
      )}
      {move.error && (
        <p role="alert" className="px-2 pb-1 text-xs text-error-ink">
          {describeError(move.error, 'document')}
        </p>
      )}
      {(shown.length > 0 || newFolder) && (
        <>
          <SectionHeader section="folders" />
          {newFolder}
          {shown.map((folder) => (
            <NoteFolderItem
              key={folder.collectionId}
              folder={folder}
              notes={inFolder(folder.collectionId)}
              searching={searching}
            />
          ))}
        </>
      )}
      {(loose.length > 0 || !searching || !shown.length) && (
        <SectionHeader section="notes" />
      )}
      <TopLevel>
        {loose.length ? (
          <ul className="flex flex-col">
            {loose.map((entry) => (
              <DraggableNoteRow key={entry.documentId} entry={entry} />
            ))}
          </ul>
        ) : !shown.length ? (
          <Hint>{searching ? 'Nothing matches.' : emptyShelf.notes}</Hint>
        ) : (
          !searching && (
            <Hint>Drag a note here to take it out of its folder.</Hint>
          )
        )}
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
      </TopLevel>
    </DndContext>
  )
}

/** The loose notes, and the place to drop a note to take it out of its folder. */
function TopLevel({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: TOP_LEVEL })
  return (
    <div
      ref={setNodeRef}
      className={cn('min-h-8 rounded-md', isOver && 'bg-hover')}
    >
      {children}
    </div>
  )
}

function NoteFolderItem({
  folder,
  notes,
  searching,
}: {
  folder: NoteFolder
  notes: NoteEntry[]
  searching: boolean
}) {
  const [open, setOpen] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: folder.collectionId })
  // A search opens the folders it found something in.
  const shown = open || searching
  return (
    <FilesystemItem
      open={shown}
      row={
        <button
          ref={setNodeRef}
          type="button"
          className={cn(row, 'gap-1 ps-1', isOver && 'bg-hover')}
          aria-expanded={shown}
          onClick={() => setOpen(!open)}
        >
          <FilesystemMarks folder open={shown} />
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
        </button>
      }
    >
      <div className="ps-5">
        {notes.length ? (
          <ul className="flex flex-col">
            {notes.map((entry) => (
              <DraggableNoteRow key={entry.documentId} entry={entry} />
            ))}
          </ul>
        ) : (
          <Hint>Empty. Drag a note here.</Hint>
        )}
      </div>
    </FilesystemItem>
  )
}

/**
 * A section's heading, set above its rows a size up and semibold. Clicking it
 * renames it; Enter keeps the name, Escape keeps the old one, and an empty
 * name gives the section its own back.
 */
function SectionHeader({ section }: { section: NoteSection }) {
  const name = useShell((state) => sectionName(section, state.noteSections))
  const rename = useShell((state) => state.renameNoteSection)
  const [editing, setEditing] = useState(false)
  return (
    <h3
      data-slot="notes-section"
      className="mt-3 flex h-7 items-center px-2 first:mt-0"
    >
      {editing ? (
        <input
          // The person clicked the heading to rename it a moment ago.
          autoFocus
          aria-label="Section name"
          defaultValue={name}
          className="min-w-0 flex-1 rounded-sm bg-transparent text-[14.5px] font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          onFocus={(event) => event.target.select()}
          onBlur={(event) => {
            rename(section, event.currentTarget.value)
            setEditing(false)
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              event.currentTarget.value = name
              event.currentTarget.blur()
            }
          }}
        />
      ) : (
        <button
          type="button"
          title="Rename this section"
          className="min-w-0 flex-1 truncate rounded-sm text-start text-[14.5px] font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          onClick={() => setEditing(true)}
        >
          {name}
        </button>
      )}
    </h3>
  )
}

/** Name a new folder in place; Enter makes it, Escape or leaving it empty does not. */
function NewFolder({ onDone }: { onDone: () => void }) {
  const folders = useNoteFolders()
  const create = useNewFolder()
  const [name, setName] = useState('')
  const taken = folders.data?.folders.map((folder) => folder.name) ?? []
  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        create.mutate(folderName(name, taken), { onSuccess: onDone })
      }}
    >
      <div className={cn(row, 'gap-1 ps-1 hover:bg-transparent')}>
        <FilesystemMarks folder open={false} empty />
        <input
          // The person asked for this field a moment ago.
          autoFocus
          aria-label="Folder name"
          placeholder="Folder name"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
          value={name}
          disabled={create.isPending}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onDone()
          }}
          onBlur={() => {
            if (!name.trim() && !create.isPending) onDone()
          }}
        />
      </div>
      {create.error && (
        <p role="alert" className="px-2 pb-1 text-xs text-error-ink">
          {describeError(create.error, 'document')}
        </p>
      )}
    </form>
  )
}

/**
 * The folder of what agents wrote to their memory, after the person's own
 * notes. Its colour is the complement of the person's folders.
 */
function AgentNotes({ query, order }: { query: string; order: NoteOrder }) {
  const [open, setOpen] = useState(false)
  return (
    <FilesystemItem
      open={open}
      row={
        <button
          type="button"
          className={`${row} gap-1 ps-1`}
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
        <NoteList query={query} shelf="agent" order={order} />
      </div>
    </FilesystemItem>
  )
}

function NoteList({
  query,
  shelf,
  order,
}: {
  query: string
  shelf: NoteShelf
  order: NoteOrder
}) {
  const library = useNoteLibrary(query, shelf, order)
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

/** A note the person can drag onto a folder, by the document it opens. */
function DraggableNoteRow({ entry }: { entry: NoteEntry }) {
  const drag = useDraggable({ id: entry.opens })
  return (
    <NoteRow
      entry={entry}
      drag={{
        ref: drag.setNodeRef,
        props: { ...drag.attributes, ...drag.listeners },
        style: {
          transform: CSS.Translate.toString(drag.transform),
          zIndex: drag.isDragging ? 10 : undefined,
          position: drag.isDragging ? 'relative' : undefined,
        },
      }}
    />
  )
}

function NoteRow({
  entry,
  drag,
}: {
  entry: NoteEntry
  drag?: {
    ref: (node: HTMLElement | null) => void
    props: object
    style: CSSProperties
  }
}) {
  const navigate = useNavigate()
  const { documentId } = useParams({ strict: false })
  const active = documentId === entry.opens
  return (
    <li ref={drag?.ref} style={drag?.style}>
      <button
        type="button"
        {...drag?.props}
        className={cn(row, 'gap-1 ps-1')}
        data-active={active || undefined}
        aria-current={active ? 'page' : undefined}
        onClick={() =>
          void navigate({
            to: '/notes/$documentId',
            params: { documentId: entry.opens },
          })
        }
      >
        <FilesystemMarks
          folder={false}
          open={false}
          icon={<NoteIcon entry={entry} />}
        />
        <NoteTitle entry={entry} />
      </button>
    </li>
  )
}

/** Each state of a note, and what the row says of it beside the title, if anything. */
const MARKS: Record<
  NoteMark,
  { Mark: typeof Icon.Article; tone: string; said?: string }
> = {
  written: { Mark: Icon.Article, tone: 'text-ink-faint' },
  editing: { Mark: Icon.Draft, tone: 'text-ink-muted', said: 'saving' },
  unsaved: { Mark: Icon.Draft, tone: 'text-error-ink', said: 'not saved' },
  agent: { Mark: Icon.AgentNote, tone: 'text-ink-faint' },
  copied: { Mark: Icon.Attachments, tone: 'text-ink-faint' },
}

const useMark = (entry: NoteEntry) =>
  noteMark(
    entry,
    useNoteStatus((state) => state.status[entry.opens]),
  )

function NoteIcon({ entry }: { entry: NoteEntry }) {
  const mark = useMark(entry)
  const { Mark, tone } = MARKS[mark]
  return <Mark data-mark={mark} className={cn('size-4 shrink-0', tone)} />
}

function NoteTitle({ entry }: { entry: NoteEntry }) {
  const { said } = MARKS[useMark(entry)]
  return (
    <span className="min-w-0 flex-1 truncate">
      {entry.title}
      {said && <span className="sr-only"> ({said})</span>}
    </span>
  )
}
