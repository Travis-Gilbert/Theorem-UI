// SOURCING: coss ui sidebar, collapsible, menu and input over Base UI, the shadcn button, @dnd-kit/core (DndContext, useDroppable and DragOverlay: a thread dragged onto a project moves there), @dnd-kit/sortable with @dnd-kit/modifiers and @dnd-kit/utilities (a project dragged to another place in its list, as the rail's destinations are), @tanstack/react-router, the shell's tenant and command palette, useGlideHighlight from components/motion, lib/theorem/organization. coss ui kbd for the search shortcut, lib/theorem/sidebar-prefs for pins. The shape (Search, New thread, Pinned, Projects, Chats, the Librarian below) is docs/plans/projects-sidebar-and-session-graph.md §5, after the Linear, Claude and Twenty sidebars on Mobbin; thread membership is translated from mikecann/threadbear@78b77e1 (MIT, Mike Cann).
import { ContextMenu } from '@base-ui/react/context-menu'
import { useAuiState } from '@assistant-ui/react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type {
  Active,
  CollisionDetection,
  DragEndEvent,
  DragStartEvent,
  Modifier,
} from '@dnd-kit/core'
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { ThreadFromFailure } from '@/components/assistant-ui/elements/thread-list.aui'
import { focusComposer } from '@/components/chat/composer-references'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/coss/collapsible'
import { Input } from '@/components/coss/input'
import { Kbd } from '@/components/coss/kbd'
import {
  Menu,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from '@/components/coss/menu'
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/coss/sidebar'
import { Icon } from '@/components/icons'
import { useGlideHighlight } from '@/components/motion'
import { ProjectGlyph, SessionGlyph } from './glyphs'
import { ProjectStateDialog } from './project-state-dialog'
import { SessionTypeDialog } from './session-type-dialog'
import {
  TREE_TICK,
  OrganizeTree,
  ThreadRow,
  useRevealOpenThread,
} from './thread-row'
import type { RowDrag } from './thread-row'
import { neighbour } from '@/lib/theorem/row-neighbour'
import { useCommandPalette } from '@/components/shell/command-palette'
import { useShellMode } from '@/components/shell/modes'
import { useCreateProject, useTenant } from '@/components/shell/projects'
import { useShell } from '@/components/shell/shell-state'
import { describeError } from '@/lib/theorem/client'
import {
  nestByOrigin,
  rootOf,
  organizationKey,
  useLibrarianControl,
  useMoveThread,
  useOrganization,
  useOrganizedViews,
} from '@/lib/theorem/organization'
import type {
  OrganizationRead,
  ProjectEntry,
  ThreadEntry,
} from '@/lib/theorem/organization'
import { isPinned, useSidebarPrefs } from '@/lib/theorem/sidebar-prefs'
import type { Pin } from '@/lib/theorem/sidebar-prefs'
import { cn } from '@/lib/utils'
import { LibrarianFooter } from './librarian-footer'

const HIGHLIGHTED = '[data-organize-row="primary"]'
const panelMotion =
  'duration-(--duration-glide) ease-glide data-ending-style:duration-(--duration-exit) data-ending-style:ease-exit'

/** Remembers a section being open, per browser, with a default until it is touched. */
function useSectionOpen(key: string, fallback: boolean) {
  const open = useShell((s) => s.organizeOpen[key] ?? fallback)
  const set = useShell((s) => s.setOrganizeOpen)
  return [open, (next: boolean) => set(key, next)] as const
}

/** Threads a project lists before "Show more", so one busy project does not push the others away. */
const THREADS_SHOWN = 4
/** Chats outside every project list more: that is where a chat goes until it is filed. */
const CHATS_SHOWN = 8

/** Where a dragged thread can land: a project, or out of every project (null). */
type DropTarget = { projectId: string | null }

const projectItem = (projectId: string) => `project:${projectId}`

/** The thread a drag carries; a dragged project carries none. */
const threadOf = (active: Active | null) =>
  (active?.data.current as Partial<RowDrag> | undefined)?.thread

/** Whether a place takes what is dragged: a thread that is not already there. */
function takes(active: Active | null, projectId: string | null) {
  const thread = threadOf(active)
  if (!thread) return false
  return projectId === null
    ? thread.memberships.length > 0
    : !thread.memberships.some((m) => m.projectId === projectId)
}

const dropRing = 'rounded-lg bg-selected/50 outline-1 outline-focus'

/**
 * A group's name: a step above the 14px rows in size and weight, in full ink,
 * with the space above the group setting it apart instead of a rule.
 */
const HEADING = 'h-8 px-2 text-ink'
/** The group gap comes from the navigation's spacing role, not each group. */
const GROUP = 'p-0'

/** The palette's shortcut as this keyboard writes it. */
const SEARCH_SHORTCUT = /mac|iphone|ipad/i.test(
  typeof navigator === 'undefined' ? '' : navigator.userAgent,
)
  ? '⌘K'
  : 'Ctrl K'

/** A thread lands on what the pointer is over; a project takes the place of the nearest project. */
const collide: CollisionDetection = (args) =>
  threadOf(args.active)
    ? pointerWithin(args)
    : closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (place) => place.data.current?.sortable,
        ),
      })

/** A project moves up and down its list only; a thread goes where the pointer does. */
const keepProjectsInList: Modifier = (args) =>
  threadOf(args.active)
    ? args.transform
    : restrictToParentElement({
        ...args,
        transform: restrictToVerticalAxis(args),
      })

/**
 * Cancels the click a drag's release makes. dnd-kit stops that click at the
 * document, before React hears it, and leaves its default: Firefox sends it to
 * the dragged row's link, which then loads its page. The window hears it first.
 */
function cancelReleaseClick() {
  const cancel = (event: Event) => event.preventDefault()
  window.addEventListener('click', cancel, { capture: true, once: true })
  // As long as dnd-kit's own guard stays up after a drag.
  setTimeout(
    () => window.removeEventListener('click', cancel, { capture: true }),
    50,
  )
}

/** The chat being started where the composer will file it, until its first message makes it a thread. */
function useStartingIn() {
  const { threadId } = useParams({ strict: false })
  const mode = useShellMode()
  const projectId = useShell((s) => s.projectId)
  return mode === 'chat' && threadId === undefined ? projectId : undefined
}

function StartingRow() {
  return (
    <SidebarMenuSubItem className={TREE_TICK}>
      <SidebarMenuSubButton
        data-organize-row="primary"
        aria-current
        className="relative z-[1] w-full translate-x-0"
        render={<button type="button" onClick={() => void focusComposer()} />}
      >
        <Icon.NewChat aria-hidden />
        <span className="min-w-0 flex-1 truncate text-start">New thread</span>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  )
}

/** The rows of a list, forks and continuations nested under their source. */
function ThreadRows({
  threads,
  place,
  first = THREADS_SHOWN,
}: {
  threads: readonly ThreadEntry[]
  place: string
  /** How many show before "Show more". */
  first?: number
}) {
  const { roots, children } = useMemo(() => nestByOrigin(threads), [threads])
  const { threadId: openThreadId } = useParams({ strict: false })
  const [showAll, setShowAll] = useState(false)
  // The first few, and the open one wherever it is, so it stays visibly in its project.
  // A nested open one keeps the root it shows under.
  const openRoot = openThreadId && rootOf(threads, openThreadId)
  const shown = showAll
    ? roots
    : roots.filter(
        (thread, index) => index < first || thread.threadId === openRoot,
      )
  const hidden = roots.length - shown.length
  return (
    <>
      {shown.map((thread) => (
        <ThreadRow
          key={thread.threadId}
          thread={thread}
          place={place}
          childThreads={children.get(thread.threadId)}
          childrenOf={children}
        />
      ))}
      {hidden > 0 && (
        <SidebarMenuSubItem className={TREE_TICK}>
          <SidebarMenuSubButton
            className="w-full translate-x-0 text-ink-muted"
            render={<button type="button" onClick={() => setShowAll(true)} />}
          >
            Show {hidden} more
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      )}
    </>
  )
}

function ProjectNode({
  project,
  threads,
  starting,
  onNewThread,
  onMove,
  served,
}: {
  project: ProjectEntry
  threads: readonly ThreadEntry[]
  /** A new chat is being started here. */
  starting: boolean
  onNewThread: (projectId: string) => void
  /** Moves the project one place up or down the list, where there is one. */
  onMove: { up?: () => void; down?: () => void }
  served: boolean
}) {
  const [stored, setOpen] = useSectionOpen(
    `project:${project.projectId}`,
    false,
  )
  const open = stored || starting
  const [editingState, setEditingState] = useState(false)
  const pin: Pin = { kind: 'project', id: project.projectId }
  const pinned = useSidebarPrefs((s) => isPinned(s.pins, pin))
  const togglePin = useSidebarPrefs((s) => s.togglePin)
  const { projectId: openProjectId } = useParams({ strict: false })
  const current = openProjectId === project.projectId
  // One node does both: a dragged thread drops on it, and it is dragged among the projects.
  const {
    setNodeRef,
    listeners,
    transform,
    transition,
    isDragging,
    isOver,
    active,
  } = useSortable({
    id: projectItem(project.projectId),
    data: { projectId: project.projectId } satisfies DropTarget,
  })
  const accepting = isOver && takes(active, project.projectId)
  const sessions = `${threads.length} ${threads.length === 1 ? 'session' : 'sessions'}`
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={
        <SidebarMenuItem
          ref={setNodeRef}
          style={{ transform: CSS.Translate.toString(transform), transition }}
          className={cn(
            'group/project',
            accepting && dropRing,
            isDragging &&
              'z-10 rounded-lg bg-raised shadow-md ring-1 ring-separator',
          )}
        />
      }
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={
            <SidebarMenuButton
              {...listeners}
              data-appearance-recipe="ui.label"
              data-organize-row={current ? 'primary' : undefined}
              aria-current={current ? 'page' : undefined}
              title={project.state?.text ?? project.title}
              className="relative z-[1] ps-8 pe-8 hover:bg-hover"
              render={
                <Link
                  draggable={false}
                  to="/projects/$projectId"
                  params={{ projectId: project.projectId }}
                  onClick={() =>
                    useShell.getState().setProjectId(project.projectId)
                  }
                />
              }
            />
          }
        >
          <span className="min-w-0 flex-1 truncate">{project.title}</span>
        </ContextMenu.Trigger>
        <MenuPopup anchor={undefined} className="min-w-48">
          <MenuItem onClick={() => onNewThread(project.projectId)}>
            <Icon.NewChat className="size-4" />
            New session here
          </MenuItem>
          <MenuItem onClick={() => togglePin(pin)}>
            {pinned ? (
              <Icon.Unpin className="size-4" />
            ) : (
              <Icon.Pin className="size-4" />
            )}
            {pinned ? 'Unpin' : 'Pin'}
          </MenuItem>
          {served && (
            <MenuItem onClick={() => setEditingState(true)}>
              <Icon.Notes className="size-4" />
              Where it stands
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem disabled={!onMove.up} onClick={onMove.up}>
            <Icon.ArrowUp className="size-4" />
            Move up
          </MenuItem>
          <MenuItem disabled={!onMove.down} onClick={onMove.down}>
            <Icon.ArrowDown className="size-4" />
            Move down
          </MenuItem>
        </MenuPopup>
      </ContextMenu.Root>
      {/* The folder is also the disclosure: it turns into a chevron under the pointer or the keyboard. */}
      <CollapsibleTrigger
        aria-label={`${open ? 'Hide' : 'Show'} sessions in ${project.title}`}
        className="group/disclose absolute start-1 top-1 z-[2] flex size-6 items-center justify-center rounded-md text-ink-muted outline-none hover:bg-selected hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <ProjectGlyph
          aria-hidden
          className="size-4 group-hover/project:hidden group-focus-visible/disclose:hidden"
        />
        <Icon.ChevronRight
          aria-hidden
          className="hidden size-3.5 transition-transform duration-(--duration-snap) ease-snap group-hover/project:block group-focus-visible/disclose:block group-data-panel-open/disclose:rotate-90"
        />
      </CollapsibleTrigger>
      <ProjectStateDialog
        project={project}
        open={editingState}
        onOpenChange={setEditingState}
      />
      {threads.length > 0 && (
        <SidebarMenuBadge
          title={sessions}
          className="text-ink-muted tabular-nums group-hover/menu-item:opacity-0 max-md:hidden"
        >
          {threads.length}
          <span className="sr-only">
            {' '}
            {threads.length === 1 ? 'session' : 'sessions'}
          </span>
        </SidebarMenuBadge>
      )}
      <SidebarMenuAction
        showOnHover
        aria-label={`New session in ${project.title}`}
        title={`New session in ${project.title}`}
        onClick={() => onNewThread(project.projectId)}
      >
        <Icon.Add />
      </SidebarMenuAction>
      <CollapsiblePanel className={panelMotion}>
        <SidebarMenuSub className="me-0 gap-px pe-0">
          {starting && <StartingRow />}
          <ThreadRows threads={threads} place={project.projectId} />
          {threads.length === 0 && !starting && (
            <li className="px-2 py-1 text-xs text-ink-muted">
              No sessions yet. Drag one here, or start one with +.
            </li>
          )}
        </SidebarMenuSub>
      </CollapsiblePanel>
    </Collapsible>
  )
}

/** Pin order: move one up or down, from the pinned row's menu. */
function PinOrderItems({ index, count }: { index: number; count: number }) {
  const movePin = useSidebarPrefs((s) => s.movePin)
  return (
    <>
      <MenuItem
        disabled={index === 0}
        onClick={() => movePin(index, index - 1)}
      >
        <Icon.ArrowUp className="size-4" />
        Move up in Pinned
      </MenuItem>
      <MenuItem
        disabled={index === count - 1}
        onClick={() => movePin(index, index + 1)}
      >
        <Icon.ArrowDown className="size-4" />
        Move down in Pinned
      </MenuItem>
      <MenuSeparator />
    </>
  )
}

/** A pinned project: a link to its home, with the pin's own menu. */
function PinnedProjectRow({
  project,
  index,
  count,
}: {
  project: ProjectEntry
  index: number
  count: number
}) {
  const togglePin = useSidebarPrefs((s) => s.togglePin)
  const { projectId: openProjectId } = useParams({ strict: false })
  const current = openProjectId === project.projectId
  return (
    <SidebarMenuSubItem className={TREE_TICK}>
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={
            <SidebarMenuSubButton
              data-appearance-recipe="ui.label"
              data-organize-row={current ? 'also' : undefined}
              aria-current={current ? 'page' : undefined}
              className="relative z-[1] h-8 w-full translate-x-0 hover:bg-hover data-[organize-row=also]:bg-hover sm:h-8"
              render={
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: project.projectId }}
                  onClick={() =>
                    useShell.getState().setProjectId(project.projectId)
                  }
                />
              }
            />
          }
        >
          <ProjectGlyph aria-hidden className="text-ink-muted" />
          <span className="min-w-0 flex-1 truncate">{project.title}</span>
        </ContextMenu.Trigger>
        <MenuPopup anchor={undefined} className="min-w-48">
          <PinOrderItems index={index} count={count} />
          <MenuItem
            onClick={() =>
              togglePin({ kind: 'project', id: project.projectId })
            }
          >
            <Icon.Unpin className="size-4" />
            Unpin
          </MenuItem>
        </MenuPopup>
      </ContextMenu.Root>
    </SidebarMenuSubItem>
  )
}

/**
 * The sessions and projects this person keeps at the top, in their order.
 * Kept in this browser until Theorem serves a pin per person; pinning moves
 * nothing and locks nothing.
 */
function PinnedGroup({
  projects,
  byId,
}: {
  projects: readonly ProjectEntry[]
  byId: ReadonlyMap<string, ThreadEntry>
}) {
  const pins = useSidebarPrefs((s) => s.pins)
  const [open, setOpen] = useSectionOpen('pinned', true)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarGroup className={GROUP}>
        <SidebarGroupLabel
          data-appearance-recipe="ui.group"
          className={HEADING}
          render={
            <CollapsibleTrigger className="w-full justify-start gap-1 hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus" />
          }
        >
          Pinned
          <Icon.ChevronRight
            aria-hidden
            className="size-3.5 text-ink-muted transition-transform duration-(--duration-snap) ease-snap in-data-panel-open:rotate-90"
          />
        </SidebarGroupLabel>
        <CollapsiblePanel className={panelMotion}>
          <SidebarMenuSub className="mx-0 translate-x-0 gap-px border-l-0 px-0 *:before:hidden">
            {pins.map((pin, index) => {
              if (pin.kind === 'project') {
                const project = projects.find((p) => p.projectId === pin.id)
                return (
                  project && (
                    <PinnedProjectRow
                      key={`project:${pin.id}`}
                      project={project}
                      index={index}
                      count={pins.length}
                    />
                  )
                )
              }
              const thread = byId.get(pin.id)
              return (
                thread && (
                  <ThreadRow
                    key={`thread:${pin.id}`}
                    thread={thread}
                    place="pinned"
                    menuExtra={
                      <PinOrderItems index={index} count={pins.length} />
                    }
                  />
                )
              )
            })}
            {pins.length === 0 && (
              <li className="px-2 py-1 text-xs text-ink-muted">
                Pin a session or project from its menu. Pins are kept in this
                browser.
              </li>
            )}
          </SidebarMenuSub>
        </CollapsiblePanel>
      </SidebarGroup>
    </Collapsible>
  )
}

/**
 * A project being named where it will be listed. Enter or leaving the field
 * makes it; Escape, or leaving it empty or after a refusal, drops it.
 */
function NewProjectRow({
  onDone,
  onCreated,
}: {
  onDone: () => void
  onCreated: (projectId: string) => void
}) {
  const [title, setTitle] = useState('')
  const create = useCreateProject()
  const submit = () => {
    const name = title.trim()
    if (!name) return onDone()
    if (create.isPending) return
    create.mutate(name, {
      onSuccess: ({ record }) => {
        onDone()
        onCreated(record.projectId)
      },
    })
  }
  return (
    <SidebarMenuItem>
      <div className="flex h-8 items-center gap-2 ps-2 pe-1">
        <Icon.Folder />
        <Input
          autoFocus
          size="sm"
          aria-label="Project name"
          placeholder="Project name"
          value={title}
          // Read-only keeps the focus a disabled field would lose.
          readOnly={create.isPending}
          aria-busy={create.isPending}
          className="h-7"
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => (create.isError ? onDone() : submit())}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter') submit()
            // A create already sent still lands; leaving now would drop its place in the list.
            else if (event.key === 'Escape' && !create.isPending) onDone()
          }}
        />
      </div>
      {create.error && (
        <p role="alert" className="px-2 py-1 text-xs text-error-ink">
          {describeError(create.error)}
        </p>
      )}
    </SidebarMenuItem>
  )
}

/**
 * The chats outside every project, beside the projects and not among them: a
 * chat started with no project is listed here, and a thread dragged here
 * leaves its projects.
 */
function ChatsGroup({
  threads,
  starting,
}: {
  threads: readonly ThreadEntry[]
  starting: boolean
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: 'unsorted',
    data: { projectId: null } satisfies DropTarget,
  })
  const accepting = isOver && takes(active, null)
  return (
    <SidebarGroup ref={setNodeRef} className={cn(GROUP, accepting && dropRing)}>
      <SidebarGroupLabel data-appearance-recipe="ui.group" className={HEADING}>
        Chats
      </SidebarGroupLabel>
      {/* The rows a project nests, here at the top level: no guide line, no ticks. */}
      <SidebarMenuSub className="mx-0 translate-x-0 gap-px border-l-0 px-0 *:before:hidden">
        {starting && <StartingRow />}
        <ThreadRows threads={threads} place="unsorted" first={CHATS_SHOWN} />
        {threads.length === 0 && !starting && (
          <li className="px-2 py-1 text-xs text-ink-muted">
            No chats yet. Start one above, or drag one out of a project.
          </li>
        )}
      </SidebarMenuSub>
    </SidebarGroup>
  )
}

function WorkspaceHeader({
  organization,
  onNewProject,
}: {
  organization: OrganizationRead | undefined
  onNewProject: () => void
}) {
  const tenant = useTenant()
  const control = useLibrarianControl()
  const librarian = organization?.served ? organization.librarian : undefined
  return (
    <div className="flex h-14 shrink-0 items-center px-1.5">
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              className="h-12 w-full justify-start gap-2 rounded-lg px-2 text-start font-normal hover:bg-hover data-popup-open:bg-hover"
            />
          }
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-lg leading-tight font-bold">
              Theorem
            </span>
            <span className="truncate text-xs leading-tight text-ink-faint-sheet">
              {tenant ?? 'Personal workspace'}
            </span>
          </span>
          <Icon.UpDown className="size-3.5 shrink-0 text-ink-faint" />
        </MenuTrigger>
        <MenuPopup align="start" className="min-w-52">
          <MenuItem onClick={onNewProject}>
            <Icon.Folder className="size-4" />
            New project
          </MenuItem>
          {librarian && (
            <MenuItem
              onClick={() => control.mutate({ paused: !librarian.paused })}
            >
              <Icon.Librarian className="size-4" />
              {librarian.paused
                ? 'Resume the Librarian'
                : 'Pause the Librarian'}
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuLinkItem render={<Link to="/settings" />}>
            <Icon.Settings className="size-4" />
            Settings
          </MenuLinkItem>
        </MenuPopup>
      </Menu>
    </div>
  )
}

/** Keeps the tree honest about what this tab just did: a new thread, a run ending. */
function useFreshAfterRuns(known: (threadId: string) => boolean) {
  const client = useQueryClient()
  const { threadId } = useParams({ strict: false })
  const running = useAuiState((s) => s.thread.isRunning)
  const missing = threadId !== undefined && !known(threadId)
  useEffect(() => {
    void client.invalidateQueries({ queryKey: organizationKey })
  }, [client, running, missing])
}

/** Chat's panel: Search and New thread, the person's pins, a stable project tree and the chats outside it, the Librarian below. */
export function OrganizedPanel({ footer }: { footer?: ReactNode }) {
  const { data, error, isPending, dataUpdatedAt } = useOrganization()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const views = useOrganizedViews()
  useRevealOpenThread(views)
  useFreshAfterRuns((threadId) => views.byId.has(threadId))

  const inbox = data?.projects.find((project) => project.isInbox)
  const startingIn = useStartingIn()
  // A chat started outside every project shows under Chats until it is filed.
  const startingUnsorted =
    startingIn !== undefined &&
    (startingIn === inbox?.projectId ||
      !views.projects.some((p) => p.project.projectId === startingIn))

  const newThread = (projectId = inbox?.projectId) => {
    const shell = useShell.getState()
    if (projectId) {
      shell.setProjectId(projectId)
      if (projectId !== inbox?.projectId)
        shell.setOrganizeOpen(`project:${projectId}`, true)
    }
    void navigate({ to: '/' }).then(() =>
      requestAnimationFrame(() => void focusComposer()),
    )
  }

  const { threadId: openThreadId } = useParams({ strict: false })
  const listRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  useGlideHighlight(listRef, pillRef, HIGHLIGHTED, 'data-organize-row')

  // The arrow keys walk the threads in the order the tree draws them. A pinned
  // session is listed twice, so the walk goes by row, not by address.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if ((event.target as HTMLElement).closest('input, [role="menu"]')) return
    const links = [
      ...(listRef.current?.querySelectorAll<HTMLAnchorElement>(
        'a[href^="/c/"]',
      ) ?? []),
    ]
    if (!links.length) return
    const focused = (event.target as HTMLElement).closest('a')
    const openHref = openThreadId ? `/c/${openThreadId}` : undefined
    const at = focused
      ? links.indexOf(focused)
      : links.findIndex((link) => link.getAttribute('href') === openHref)
    const rows = links.map((_, index) => String(index))
    const next = neighbour(
      rows,
      at < 0 ? undefined : String(at),
      event.key === 'ArrowDown' ? 1 : -1,
    )
    if (next === undefined) return
    event.preventDefault()
    links[Number(next)]?.focus()
  }

  // A pin whose session or project is gone goes too, once Theorem has said so.
  const prunePins = useSidebarPrefs((s) => s.prunePins)
  useEffect(() => {
    if (!data) return
    const threads = new Set(data.threads.map((t) => t.threadId))
    const projects = new Set(data.projects.map((p) => p.projectId))
    prunePins((pin) =>
      pin.kind === 'thread' ? threads.has(pin.id) : projects.has(pin.id),
    )
  }, [data, prunePins])

  // A drag starts after a few pixels, so a click on a row still opens it.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )
  const mover = useMoveThread()
  /** The thread being dragged; a dragged project is its own row. */
  const [dragging, setDragging] = useState<RowDrag>()
  /** A project is being dragged, so rows sit away from where they are laid out. */
  const [sorting, setSorting] = useState(false)
  const projectIds = views.projects.map(({ project }) => project.projectId)
  const projectItems = projectIds.map(projectItem)
  const setProjectOrder = useShell((s) => s.setProjectOrder)
  const placeProject = (from: number, to: number) => {
    if (from < 0 || to < 0 || from === to || to >= projectIds.length) return
    setProjectOrder(arrayMove(projectIds, from, to))
  }
  const onDragStart = ({ active }: DragStartEvent) => {
    if (threadOf(active)) setDragging(active.data.current as RowDrag)
    else setSorting(true)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(undefined)
    setSorting(false)
    cancelReleaseClick()
    if (!over) return
    const drag = active.data.current as Partial<RowDrag>
    if (!drag.thread || drag.from === undefined) {
      placeProject(
        projectItems.indexOf(String(active.id)),
        projectItems.indexOf(String(over.id)),
      )
      return
    }
    const { projectId } = over.data.current as DropTarget
    mover.move(drag.thread, drag.from, projectId)
    if (projectId)
      useShell.getState().setOrganizeOpen(`project:${projectId}`, true)
  }
  const onDragCancel = () => {
    setDragging(undefined)
    setSorting(false)
    cancelReleaseClick()
  }

  const tree = useMemo(
    () => ({
      projects: data?.projects ?? [],
      views,
      served: data?.served ?? false,
      readAtMs: dataUpdatedAt,
    }),
    [data, views, dataUpdatedAt],
  )

  return (
    <div data-organize-panel className="flex h-full flex-col">
      <WorkspaceHeader
        organization={data}
        onNewProject={() => setCreating(true)}
      />
      <SidebarMenu className="shrink-0 gap-px px-2 pb-1">
        <SidebarMenuItem>
          <SidebarMenuButton
            data-appearance-recipe="ui.label"
            className="hover:bg-hover"
            onClick={() => useCommandPalette.getState().setOpen(true)}
          >
            <Icon.Search aria-hidden />
            <span className="min-w-0 flex-1 truncate">Search</span>
            <Kbd className="bg-transparent text-ink-faint">
              {SEARCH_SHORTCUT}
            </Kbd>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            data-appearance-recipe="ui.label"
            className="text-ink-muted hover:bg-hover hover:text-ink"
            onClick={() => newThread()}
          >
            <Icon.NewChat aria-hidden />
            <span className="min-w-0 flex-1 truncate">New thread</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarContent
        role="navigation"
        aria-label="Threads"
        className="relative gap-0 px-2 pb-3"
      >
        <div
          ref={pillRef}
          aria-hidden
          style={{ opacity: 0 }}
          className={cn(
            'pointer-events-none absolute rounded-lg bg-selected',
            // The highlight is placed by layout, which a dragged project leaves.
            sorting && 'invisible',
          )}
        />
        <OrganizeTree.Provider value={tree}>
          <DndContext
            sensors={sensors}
            collisionDetection={collide}
            modifiers={[keepProjectsInList]}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <div
              ref={listRef}
              onKeyDown={onKeyDown}
              data-appearance-spacing-role="group-controls"
              className="flex flex-col pt-2"
            >
              <PinnedGroup projects={data?.projects ?? []} byId={views.byId} />
              <SidebarGroup className={GROUP}>
                <SidebarGroupLabel
                  data-appearance-recipe="ui.group"
                  className={HEADING}
                >
                  Projects
                </SidebarGroupLabel>
                <SidebarGroupAction
                  aria-label="New project"
                  title="New project"
                  className="top-1 right-1"
                  onClick={() => setCreating(true)}
                >
                  <Icon.Add />
                </SidebarGroupAction>
                <SidebarMenu className="gap-px">
                  {creating && (
                    <NewProjectRow
                      onDone={() => setCreating(false)}
                      onCreated={(projectId) => {
                        // It stays where it was named: first in the list.
                        setProjectOrder([projectId, ...projectIds])
                        newThread(projectId)
                      }}
                    />
                  )}
                  {isPending &&
                    Array.from({ length: 4 }, (_, index) => (
                      <SidebarMenuSkeleton key={index} />
                    ))}
                  <SortableContext
                    items={projectItems}
                    strategy={verticalListSortingStrategy}
                  >
                    {views.projects.map(({ project, threads }, index) => (
                      <ProjectNode
                        key={project.projectId}
                        project={project}
                        threads={threads}
                        starting={startingIn === project.projectId}
                        served={tree.served}
                        onNewThread={newThread}
                        onMove={{
                          up:
                            index > 0
                              ? () => placeProject(index, index - 1)
                              : undefined,
                          down:
                            index < projectIds.length - 1
                              ? () => placeProject(index, index + 1)
                              : undefined,
                        }}
                      />
                    ))}
                  </SortableContext>
                </SidebarMenu>
                {(error ?? mover.error) && (
                  <p role="alert" className="px-2 py-1 text-xs text-error-ink">
                    {describeError(error ?? mover.error)}
                  </p>
                )}
              </SidebarGroup>
              <ChatsGroup
                threads={views.unsorted}
                starting={startingUnsorted}
              />
            </div>
            <DragOverlay dropAnimation={null}>
              {dragging && (
                <div className="flex h-8 max-w-56 items-center gap-2 rounded-lg bg-raised px-2 text-sm shadow-md ring-1 ring-separator">
                  <SessionGlyph
                    threadId={dragging.thread.threadId}
                    className="text-ink-muted"
                  />
                  <span className="min-w-0 truncate">
                    {dragging.thread.title || 'New chat'}
                  </span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </OrganizeTree.Provider>
      </SidebarContent>
      <ThreadFromFailure />
      <SessionTypeDialog />
      {data?.served && <LibrarianFooter librarian={data.librarian} />}
      {footer}
    </div>
  )
}
