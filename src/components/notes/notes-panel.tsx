// SOURCING: @tanstack/react-router (a note is /notes/$documentId), the Pages panel's row and heading grammar, Base UI Toolbar (the panel's tools, with arrow keys between them) and Menu (the sort menu), ThreadListSearch (the search that springs open, as in the Index and the threads), TooltipIconButton, ui/filesystem-item (the file tree's folder row, for the folders and Agent notes), lucide Folder and FolderPlus, @dnd-kit/core (a note dragged onto a folder; already used by the data table), the note library and folders (Theorem Documents v2 and its collections, through note-library.ts and note-folders.ts)
import {
  DndContext,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type {
  Collision,
  CollisionDetection,
  DragEndEvent,
  UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ContextMenu } from '@base-ui/react/context-menu'
import { Menu } from '@base-ui/react/menu'
import { Toolbar } from '@base-ui/react/toolbar'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ChevronRight, Folder, FolderPlus, ListPlus } from 'lucide-react'
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
import {
  AGENTS_ITEM,
  addSection,
  deleteSection,
  folderItem,
  groupBySection,
  isSectionItem,
  moveSection,
  noteItem,
  placeItem,
  renameSection,
  sectionOf,
  toggleSection,
} from './note-sections'
import type { Section, SectionId } from './note-sections'
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
  // The section a new folder is being named in, and the one being renamed.
  const [naming, setNaming] = useState<SectionId | null>(null)
  const [renaming, setRenaming] = useState<SectionId | null>(null)
  // The section the person right-clicked in, if they did it in one.
  const [target, setTarget] = useState<SectionId | null>(null)
  const order = useShell((state) => state.noteOrder)
  const layout = useShell((state) => state.noteLayout)
  const edit = useShell((state) => state.editNoteLayout)
  const create = useNewNote()
  const newNote = (into: SectionId | null = null) =>
    create.mutate(undefined, {
      onSuccess: (note) => {
        if (into) edit((l) => placeItem(l, noteItem(note.documentId), into))
        setShelf('notes')
        void navigate({
          to: '/notes/$documentId',
          params: { documentId: note.documentId },
        })
      },
    })
  const newFolder = (into: SectionId | null) => {
    setShelf('notes')
    setNaming(into ?? sectionOf(layout, folderItem('')))
  }
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
              onClick={() => newNote()}
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
              onClick={() => newFolder(null)}
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
      {shelf === 'notes' ? (
        <ContextMenu.Root>
          <ContextMenu.Trigger
            render={<nav aria-label="Notes" className={navClass} />}
            // The section the click was in names itself as the event goes by.
            onContextMenuCapture={(event) =>
              setTarget(
                (event.target instanceof Element &&
                  event.target.closest<HTMLElement>('[data-section-id]')
                    ?.dataset.sectionId) ||
                  null,
              )
            }
          >
            <NoteSections
              query={query}
              order={order}
              naming={naming}
              onNamed={() => setNaming(null)}
              renaming={renaming}
              onRename={setRenaming}
            />
          </ContextMenu.Trigger>
          <SectionsMenu
            target={target}
            onNewNote={newNote}
            onNewFolder={newFolder}
            onRename={setRenaming}
          />
        </ContextMenu.Root>
      ) : (
        <nav aria-label="Trash" className={navClass}>
          <NoteList query={query} shelf="trash" order={order} />
        </nav>
      )}
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

const navClass = 'min-h-0 flex-1 overflow-y-auto px-2 pb-3'

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

/** A section's id as a drop target and as something dragged to a new place. */
const SECTION = 'section:'
/** A folder's id as the place a note is dropped into. */
const INTO = 'into:'

const after = (id: UniqueIdentifier, prefix: string) => {
  const text = String(id)
  return text.startsWith(prefix) ? text.slice(prefix.length) : undefined
}

/**
 * A section goes to the section nearest its middle. A note goes into the
 * folder under the pointer, else into the section; a folder only ever goes
 * into a section.
 */
const collide: CollisionDetection = (args) => {
  const among = (keep: (id: string) => boolean) => ({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) =>
      keep(String(c.id)),
    ),
  })
  const sections = among((id) => id.startsWith(SECTION))
  if (after(args.active.id, SECTION)) return closestCenter(sections)
  const hits = pointerWithin(after(args.active.id, 'note:') ? args : sections)
  const folderFirst = (hit: Collision) => (after(hit.id, INTO) ? 0 : 1)
  return [...hits].sort((a, b) => folderFirst(a) - folderFirst(b))
}

type SectionsProps = {
  query: string
  order: NoteOrder
  /** The section a new folder is being named in, while there is one. */
  naming: SectionId | null
  onNamed: () => void
  /** The section whose name is being changed, while there is one. */
  renaming: SectionId | null
  onRename: (section: SectionId | null) => void
}

/**
 * The person's sections, each with the folders, loose notes and agents'
 * folder they put in it. A section is dragged by its heading to another
 * place; a row is dragged into a section, and a note onto a folder.
 */
function NoteSections({
  query,
  order,
  naming,
  onNamed,
  renaming,
  onRename,
}: SectionsProps) {
  const library = useNoteLibrary(query, 'notes', order)
  const folders = useNoteFolders()
  const move = useMoveNote()
  const layout = useShell((state) => state.noteLayout)
  const edit = useShell((state) => state.editNoteLayout)
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
  const foldersIn = groupBySection(layout, shown, (folder) =>
    folderItem(folder.collectionId),
  )
  const notesIn = groupBySection(layout, loose, (entry) =>
    noteItem(entry.opens),
  )
  const agentsIn = sectionOf(layout, AGENTS_ITEM)
  const nothing = !library.data.length && !filed.folders.length
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return
    const section = after(over.id, SECTION)
    const moving = after(active.id, SECTION)
    if (moving) {
      if (section) edit((l) => moveSection(l, moving, section))
      return
    }
    const documentId = after(active.id, 'note:')
    const folder = after(over.id, INTO)
    if (documentId && folder) {
      if (filed.folderOf.get(documentId) !== folder)
        move.mutate({ documentId, to: folder })
      return
    }
    const item = String(active.id)
    if (!section || !isSectionItem(item)) return
    // A note dropped on a section comes out of its folder to sit there.
    if (documentId && filed.folderOf.has(documentId))
      move.mutate({ documentId, to: null })
    edit((l) => placeItem(l, item, section))
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collide}
      onDragEnd={onDragEnd}
    >
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
      {searching && !shown.length && !loose.length && (
        <Hint>Nothing matches.</Hint>
      )}
      <SortableContext
        items={layout.sections.map((s) => SECTION + s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col">
          {layout.sections.map((section) => {
            const sectionFolders = foldersIn.get(section.id) ?? []
            const sectionNotes = notesIn.get(section.id) ?? []
            const agents = agentsIn === section.id
            const empty =
              !sectionFolders.length &&
              !sectionNotes.length &&
              !agents &&
              naming !== section.id
            if (searching && empty) return null
            return (
              <NoteSectionBlock
                key={section.id}
                section={section}
                // A search opens every section it found something in, and a
                // new folder opens the section it is being named in.
                open={!section.collapsed || searching || naming === section.id}
                renaming={renaming === section.id}
                onRename={onRename}
              >
                {naming === section.id && (
                  <NewFolder
                    onDone={(made) => {
                      if (made)
                        edit((l) => placeItem(l, folderItem(made), section.id))
                      onNamed()
                    }}
                  />
                )}
                {sectionFolders.map((folder) => (
                  <NoteFolderItem
                    key={folder.collectionId}
                    folder={folder}
                    notes={inFolder(folder.collectionId)}
                    searching={searching}
                  />
                ))}
                {agents && <AgentNotes query={query} order={order} />}
                {sectionNotes.length > 0 && (
                  <ul className="flex flex-col">
                    {sectionNotes.map((entry) => (
                      <DraggableNoteRow key={entry.documentId} entry={entry} />
                    ))}
                  </ul>
                )}
                {empty && (
                  <Hint>
                    {nothing && section.id === sectionOf(layout, noteItem(NEW))
                      ? emptyShelf.notes
                      : 'Drag notes or folders here.'}
                  </Hint>
                )}
              </NoteSectionBlock>
            )
          })}
        </div>
      </SortableContext>
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
    </DndContext>
  )
}

/** A row not made yet, which lands in its kind's own section. */
const NEW = ''

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
  const drop = useDroppable({ id: INTO + folder.collectionId })
  const drag = useDraggable({ id: folderItem(folder.collectionId) })
  // A search opens the folders it found something in.
  const shown = open || searching
  return (
    <FilesystemItem
      open={shown}
      row={
        <button
          ref={(node) => {
            drop.setNodeRef(node)
            drag.setNodeRef(node)
          }}
          type="button"
          {...drag.attributes}
          {...drag.listeners}
          style={dragStyle({
            transform: drag.transform,
            isDragging: drag.isDragging,
          })}
          className={cn(row, 'gap-1 ps-1', drop.isOver && 'bg-hover')}
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

/** Where a dragged row is drawn: under the pointer, above its neighbours. */
const dragStyle = ({
  transform,
  isDragging,
}: {
  transform: ReturnType<typeof useDraggable>['transform']
  isDragging: boolean
}) =>
  ({
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? 'relative' : undefined,
  }) satisfies CSSProperties

const headingText = 'text-[14.5px] font-semibold'

/**
 * A section: its heading, set a size up and semibold, over its rows. Clicking
 * the heading folds the rows away or opens them; double-clicking it, or
 * Rename section in the menu, renames it; dragging it moves the section.
 */
function NoteSectionBlock({
  section,
  open,
  renaming,
  onRename,
  children,
}: {
  section: Section
  /** Whether its rows show: it is not folded away, or something holds it open. */
  open: boolean
  renaming: boolean
  onRename: (section: SectionId | null) => void
  children: ReactNode
}) {
  const edit = useShell((state) => state.editNoteLayout)
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
    isOver,
    active,
  } = useSortable({ id: SECTION + section.id })
  const dropping = isOver && !after(active?.id ?? '', SECTION)
  return (
    <section
      ref={setNodeRef}
      data-section-id={section.id}
      aria-label={section.name}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: transition,
        zIndex: isDragging ? 10 : undefined,
        position: isDragging ? 'relative' : undefined,
      }}
      className={cn(
        'rounded-md pt-3 first:pt-0',
        dropping && 'bg-hover',
        isDragging && 'bg-sheet shadow-pill',
      )}
    >
      <h3 data-slot="notes-section" className="flex h-7 items-center px-2">
        {renaming ? (
          <input
            // The person asked to rename the section a moment ago.
            autoFocus
            aria-label="Section name"
            defaultValue={section.name}
            className={`min-w-0 flex-1 rounded-sm bg-transparent ${headingText} outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus`}
            onFocus={(event) => event.target.select()}
            onBlur={(event) => {
              const name = event.currentTarget.value
              edit((l) => renameSection(l, section.id, name))
              onRename(null)
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                event.currentTarget.value = section.name
                event.currentTarget.blur()
              }
            }}
          />
        ) : (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-expanded={open}
            title={open ? 'Fold this section away' : 'Open this section'}
            className={`group/section flex min-w-0 flex-1 items-center gap-1 rounded-sm text-start ${headingText} outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus`}
            onClick={() => edit((l) => toggleSection(l, section.id))}
            onDoubleClick={() => onRename(section.id)}
          >
            <span className="min-w-0 truncate">{section.name}</span>
            <ChevronRight
              aria-hidden="true"
              className={cn(
                'size-3.5 shrink-0 text-ink-faint transition-[rotate,opacity] duration-150',
                open
                  ? 'rotate-90 opacity-0 group-hover/section:opacity-100 group-focus-visible/section:opacity-100'
                  : 'opacity-100',
              )}
            />
          </button>
        )}
      </h3>
      {open && <div className="flex flex-col">{children}</div>}
    </section>
  )
}

/**
 * What a right-click on the notes offers: something new, in the section it
 * was on, and that section's name and removal. Deleting a section keeps its
 * rows; they go back to their own section.
 */
function SectionsMenu({
  target,
  onNewNote,
  onNewFolder,
  onRename,
}: {
  target: SectionId | null
  onNewNote: (into: SectionId | null) => void
  onNewFolder: (into: SectionId | null) => void
  onRename: (section: SectionId | null) => void
}) {
  const count = useShell((state) => state.noteLayout.sections.length)
  const edit = useShell((state) => state.editNoteLayout)
  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner className="z-50">
        {/* Focus stays put on close, so a rename's field keeps it. */}
        <ContextMenu.Popup
          finalFocus={false}
          className={`min-w-44 ${menuPopup}`}
        >
          <ContextMenu.Item
            className={menuItem}
            onClick={() => onNewNote(target)}
          >
            <Icon.NewNote className="size-4" />
            New note
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItem}
            onClick={() => onNewFolder(target)}
          >
            <FolderPlus aria-hidden="true" className="size-4" />
            New folder
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItem}
            onClick={() => {
              const id = crypto.randomUUID()
              edit((l) => addSection(l, id, target ?? undefined))
              onRename(id)
            }}
          >
            <ListPlus aria-hidden="true" className="size-4" />
            New section
          </ContextMenu.Item>
          {target && (
            <>
              <ContextMenu.Separator className="my-1 h-px bg-separator" />
              <ContextMenu.Item
                className={menuItem}
                onClick={() => onRename(target)}
              >
                <Icon.Edit className="size-4" />
                Rename section
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItem}
                disabled={count === 1}
                onClick={() => edit((l) => deleteSection(l, target))}
              >
                <Icon.Delete className="size-4" />
                Delete section
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  )
}

/** Name a new folder in place; Enter makes it, Escape or leaving it empty does not. */
function NewFolder({ onDone }: { onDone: (made?: string) => void }) {
  const folders = useNoteFolders()
  const create = useNewFolder()
  const [name, setName] = useState('')
  const taken = folders.data?.folders.map((folder) => folder.name) ?? []
  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        create.mutate(folderName(name, taken), {
          onSuccess: (made) => onDone(made.collectionId),
        })
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
 * The folder of what agents wrote to their memory. Its colour is the
 * complement of the person's folders, and it moves between sections whole.
 */
function AgentNotes({ query, order }: { query: string; order: NoteOrder }) {
  const [open, setOpen] = useState(false)
  const { setNodeRef, attributes, listeners, transform, isDragging } =
    useDraggable({ id: AGENTS_ITEM })
  return (
    <FilesystemItem
      open={open}
      row={
        <button
          ref={setNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          style={dragStyle({ transform, isDragging })}
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

/** A note the person can drag onto a folder or a section, by the document it opens. */
function DraggableNoteRow({ entry }: { entry: NoteEntry }) {
  const drag = useDraggable({ id: noteItem(entry.opens) })
  return (
    <NoteRow
      entry={entry}
      drag={{
        ref: drag.setNodeRef,
        props: { ...drag.attributes, ...drag.listeners },
        style: dragStyle({
          transform: drag.transform,
          isDragging: drag.isDragging,
        }),
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
