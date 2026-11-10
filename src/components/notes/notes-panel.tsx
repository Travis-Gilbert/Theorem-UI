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
import { useNotesLayout } from '@/lib/theorem/notes-layout'
import { describeError } from '@/lib/theorem/client'
import {
  folderName,
  placeNotes,
  renamed,
  subfolders,
  useDeleteFolder,
  useMoveNote,
  useNewFolder,
  useNoteFolders,
  useUpdateFolder,
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
  moveSection,
  noteItem,
  placeItem,
  renameSection,
  sectionOf,
  toggleSection,
} from './note-sections'
import type { Section, SectionId } from './note-sections'
import { INTO, SECTION, after, collide, dropSteps } from './note-drop'
import type { DropStep } from './note-drop'
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
  // The folder right-clicked, the one a new folder is being named inside,
  // and the one being renamed.
  const [folderTarget, setFolderTarget] = useState<string | null>(null)
  const [namingIn, setNamingIn] = useState<string | null>(null)
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const removeFolder = useDeleteFolder()
  const order = useShell((state) => state.noteOrder)
  const { layout, edit } = useNotesLayout()
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
      {(create.error ?? removeFolder.error) && (
        <p role="alert" className="px-4 pb-2 text-xs text-error-ink">
          {describeError(create.error ?? removeFolder.error, 'document')}
        </p>
      )}
      {shelf === 'notes' ? (
        <ContextMenu.Root>
          <ContextMenu.Trigger
            render={<nav aria-label="Notes" className={navClass} />}
            // The section and folder the click was in name themselves as the event goes by.
            onContextMenuCapture={(event) => {
              const at = (key: 'sectionId' | 'folderId', selector: string) =>
                (event.target instanceof Element &&
                  event.target.closest<HTMLElement>(selector)?.dataset[key]) ||
                null
              setTarget(at('sectionId', '[data-section-id]'))
              setFolderTarget(at('folderId', '[data-folder-id]'))
            }}
          >
            <NoteSections
              query={query}
              order={order}
              naming={naming}
              onNamed={() => setNaming(null)}
              renaming={renaming}
              onRename={setRenaming}
              namingIn={namingIn}
              onNamedIn={() => setNamingIn(null)}
              renamingFolder={renamingFolder}
              onRenamedFolder={() => setRenamingFolder(null)}
            />
          </ContextMenu.Trigger>
          <SectionsMenu
            target={target}
            folder={folderTarget}
            onNewNote={newNote}
            onNewFolder={newFolder}
            onNewFolderIn={setNamingIn}
            onRename={setRenaming}
            onRenameFolder={setRenamingFolder}
            onDeleteFolder={(id) => removeFolder.mutate(id)}
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

type SectionsProps = {
  query: string
  order: NoteOrder
  /** The section a new folder is being named in, while there is one. */
  naming: SectionId | null
  onNamed: () => void
  /** The section whose name is being changed, while there is one. */
  renaming: SectionId | null
  onRename: (section: SectionId | null) => void
  /** The folder a new folder is being named inside, while there is one. */
  namingIn: string | null
  onNamedIn: () => void
  /** The folder whose name is being changed, while there is one. */
  renamingFolder: string | null
  onRenamedFolder: () => void
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
  namingIn,
  onNamedIn,
  renamingFolder,
  onRenamedFolder,
}: SectionsProps) {
  const library = useNoteLibrary(query, 'notes', order)
  // The agents' folder lists the same search; the panel reads it to say
  // whether anything matched, and to open that folder on a match.
  const agentNotes = useNoteLibrary(query, 'agent', order)
  const folders = useNoteFolders()
  const move = useMoveNote()
  const update = useUpdateFolder()
  const { layout, edit, trouble } = useNotesLayout()
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
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = library
  useEffect(() => {
    if (unread && hasNextPage && !isFetchingNextPage && !isError)
      void fetchNextPage()
  }, [unread, hasNextPage, isFetchingNextPage, isError, fetchNextPage])

  if (library.isPending || folders.isPending) return <Hint>Loading notes…</Hint>
  if (library.isError)
    return (
      <Hint>
        {describeError(library.error, 'document')}{' '}
        <Button
          variant="ghost"
          size="xs"
          disabled={library.isFetching}
          onClick={() => void library.refetch()}
        >
          Try again
        </Button>
      </Hint>
    )
  // Without its folders the list still shows every note, loose.
  const filed = folders.data ?? {
    folders: [],
    folderOf: new Map<string, string>(),
  }
  const { loose, inFolder } = placeNotes(library.data, filed.folderOf)
  const searching = Boolean(query.trim())
  // A search shows the folders it found a note in, and the folders around them.
  const filled = (id: string): boolean =>
    inFolder(id).length > 0 ||
    subfolders(filed.folders, id).some((f) => filled(f.collectionId))
  const shown = subfolders(filed.folders, null).filter(
    (folder) => !searching || filled(folder.collectionId),
  )
  const foldersIn = groupBySection(layout, shown, (folder) =>
    folderItem(folder.collectionId),
  )
  const tree: FolderTree = {
    folders: filed.folders,
    inFolder,
    filled,
    searching,
    namingIn,
    onNamedIn,
    renaming: renamingFolder,
    rename: (folder, wanted) => {
      onRenamedFolder()
      const name = renamed(filed.folders, folder, wanted)
      if (name)
        update.mutate({ collectionId: folder.collectionId, change: { name } })
    },
  }
  const notesIn = groupBySection(layout, loose, (entry) =>
    noteItem(entry.opens),
  )
  const agentsIn = sectionOf(layout, AGENTS_ITEM)
  // A search keeps the agents' folder, open, until their search comes back
  // empty: while it loads or after it fails, the folder shows which.
  const agentsFound =
    searching && !(agentNotes.isSuccess && !agentNotes.data.length)
  const nothing = !library.data.length && !filed.folders.length
  const run = (step: DropStep) => {
    switch (step.kind) {
      case 'move-section':
        return edit((l) => moveSection(l, step.section, step.to))
      case 'file':
        return move.mutate({ documentId: step.documentId, to: step.to })
      case 'nest':
        return update.mutate({
          collectionId: step.folderId,
          change: { parentId: step.into },
        })
      case 'place':
        return edit((l) => placeItem(l, step.item, step.section))
    }
  }
  const onDragEnd = ({ active, over }: DragEndEvent) =>
    dropSteps(active.id, over?.id ?? null, filed).forEach(run)
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
      {trouble && (
        <p
          role="alert"
          className="flex items-center gap-2 px-2 pb-1 text-xs text-error-ink"
        >
          <span className="min-w-0 flex-1">
            {trouble.kind === 'read'
              ? 'Your sections could not be read from Theorem.'
              : 'Your last change to the sections was not saved.'}{' '}
            {describeError(trouble.error, 'document')}
          </span>
          <Button variant="ghost" size="xs" onClick={trouble.retry}>
            Try again
          </Button>
        </p>
      )}
      {(move.error ?? update.error) && (
        <p role="alert" className="px-2 pb-1 text-xs text-error-ink">
          {describeError(move.error ?? update.error, 'document')}
        </p>
      )}
      {searching && !shown.length && !loose.length && !agentsFound && (
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
            // A search drops the agents' folder only when it found nothing there.
            const agents =
              agentsIn === section.id && (!searching || agentsFound)
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
                    parentId={null}
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
                    tree={tree}
                  />
                ))}
                {agents && (
                  <AgentNotes query={query} order={order} found={agentsFound} />
                )}
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

/** Every folder, and what the folder rows need to show and edit them. */
type FolderTree = {
  folders: NoteFolder[]
  inFolder: (collectionId: string) => NoteEntry[]
  /** Whether a search found a note in the folder or a folder inside it. */
  filled: (collectionId: string) => boolean
  searching: boolean
  namingIn: string | null
  onNamedIn: () => void
  renaming: string | null
  rename: (folder: NoteFolder, wanted: string) => void
}

/**
 * A folder: its row, then the folders inside it and its notes. A note or a
 * folder dragged onto the row goes inside; the row drags to another folder or
 * a section.
 */
function NoteFolderItem({
  folder,
  tree,
}: {
  folder: NoteFolder
  tree: FolderTree
}) {
  const [open, setOpen] = useState(false)
  const drop = useDroppable({ id: INTO + folder.collectionId })
  const drag = useDraggable({ id: folderItem(folder.collectionId) })
  const naming = tree.namingIn === folder.collectionId
  // A new folder opens the folder it is named in, which stays open to show it.
  if (naming && !open) setOpen(true)
  // A search opens the folders it found something in.
  const shown = open || naming || tree.searching
  const inside = subfolders(tree.folders, folder.collectionId).filter(
    (f) => !tree.searching || tree.filled(f.collectionId),
  )
  const notes = tree.inFolder(folder.collectionId)
  return (
    <FilesystemItem
      open={shown}
      row={
        tree.renaming === folder.collectionId ? (
          <div
            data-folder-id={folder.collectionId}
            className={cn(row, 'gap-1 ps-1 hover:bg-transparent')}
          >
            <FilesystemMarks folder open={shown} />
            <input
              // The person asked to rename this folder a moment ago.
              autoFocus
              aria-label="Folder name"
              defaultValue={folder.name}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              onFocus={(event) => event.currentTarget.select()}
              onBlur={(event) => tree.rename(folder, event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') tree.rename(folder, folder.name)
              }}
            />
          </div>
        ) : (
          <button
            ref={(node) => {
              drop.setNodeRef(node)
              drag.setNodeRef(node)
            }}
            type="button"
            data-folder-id={folder.collectionId}
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
        )
      }
    >
      <div className="ps-5">
        {naming && (
          <NewFolder parentId={folder.collectionId} onDone={tree.onNamedIn} />
        )}
        {inside.map((child) => (
          <NoteFolderItem key={child.collectionId} folder={child} tree={tree} />
        ))}
        {notes.length > 0 && (
          <ul className="flex flex-col">
            {notes.map((entry) => (
              <DraggableNoteRow key={entry.documentId} entry={entry} />
            ))}
          </ul>
        )}
        {!naming && !inside.length && !notes.length && (
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
  const { edit } = useNotesLayout()
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
  folder,
  onNewNote,
  onNewFolder,
  onNewFolderIn,
  onRename,
  onRenameFolder,
  onDeleteFolder,
}: {
  target: SectionId | null
  /** The folder right-clicked, if the click was on one. */
  folder: string | null
  onNewNote: (into: SectionId | null) => void
  onNewFolder: (into: SectionId | null) => void
  onNewFolderIn: (folder: string) => void
  onRename: (section: SectionId | null) => void
  onRenameFolder: (folder: string) => void
  onDeleteFolder: (folder: string) => void
}) {
  const { layout, edit } = useNotesLayout()
  const count = layout.sections.length
  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner className="z-50">
        {/* Focus stays put on close, so a rename's field keeps it. */}
        <ContextMenu.Popup
          finalFocus={false}
          className={`min-w-44 ${menuPopup}`}
        >
          {folder && (
            <>
              <ContextMenu.Item
                className={menuItem}
                onClick={() => onNewFolderIn(folder)}
              >
                <FolderPlus aria-hidden="true" className="size-4" />
                New folder inside
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItem}
                onClick={() => onRenameFolder(folder)}
              >
                <Icon.Edit className="size-4" />
                Rename folder
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItem}
                onClick={() => onDeleteFolder(folder)}
              >
                <Icon.Delete className="size-4" />
                Delete folder
              </ContextMenu.Item>
              <ContextMenu.Separator className="my-1 h-px bg-separator" />
            </>
          )}
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
function NewFolder({
  parentId,
  onDone,
}: {
  /** The folder it goes inside, or null at the top level. */
  parentId: string | null
  onDone: (made?: string) => void
}) {
  const folders = useNoteFolders()
  const create = useNewFolder()
  const [name, setName] = useState('')
  // Theorem keeps names apart among the folders side by side, not across all.
  const taken = subfolders(folders.data?.folders ?? [], parentId).map(
    (folder) => folder.name,
  )
  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        create.mutate(
          { name: folderName(name, taken), parentId },
          {
            onSuccess: (made) => onDone(made.collectionId),
          },
        )
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
function AgentNotes({
  query,
  order,
  found,
}: {
  query: string
  order: NoteOrder
  /** A search found notes here, or has not settled, so the folder opens on it. */
  found: boolean
}) {
  const [chosen, setOpen] = useState(false)
  const open = chosen || found
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
          onClick={() => setOpen(!chosen)}
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
    return (
      <Hint>
        {describeError(library.error, 'document')}{' '}
        <Button
          variant="ghost"
          size="xs"
          disabled={library.isFetching}
          onClick={() => void library.refetch()}
        >
          Try again
        </Button>
      </Hint>
    )
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
