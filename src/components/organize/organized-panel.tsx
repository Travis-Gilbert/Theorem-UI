// SOURCING: coss ui sidebar, collapsible, menu and kbd over Base UI, the shadcn button, @dnd-kit/core (DndContext, useDroppable and DragOverlay: a thread dragged onto a project moves there), @dnd-kit/sortable with @dnd-kit/modifiers and @dnd-kit/utilities (a project dragged to another place in its list, as the rail's destinations are), @tanstack/react-router, the shell's tenant and command palette, useGlideHighlight from components/motion, lib/theorem/organization. The shape (a stable tree with attention views above it and the Librarian below) is the design direction of 2026-11-05, with thread membership translated from mikecann/threadbear@78b77e1 (MIT, Mike Cann).
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
import { ProjectGlyph, ThreadGlyph } from './glyphs'
import { ProjectStateDialog } from './project-state-dialog'
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
import { useTenant } from '@/components/shell/projects'
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
  useProjectOutputs,
} from '@/lib/theorem/organization'
import type {
  OrganizationRead,
  ProjectEntry,
  ThreadEntry,
} from '@/lib/theorem/organization'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import { openReview } from '@/lib/theorem/reviews'
import { cn } from '@/lib/utils'
import { LibrarianFooter } from './librarian-footer'
import { NewProjectDialog } from './new-project-dialog'

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

const DOT = {
  attention: 'bg-attention',
  running: 'bg-teal dark:bg-teal-ink',
  later: 'border border-ink-muted',
} as const

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

/** One row above the tree: a dot, a name, a count. It opens in place, so the tree stays where it is. */
function QuickView({
  id,
  label,
  tone,
  threads,
  hint,
}: {
  id: string
  label: string
  tone: keyof typeof DOT
  threads: readonly ThreadEntry[]
  hint?: 'later'
}) {
  const [stored, setOpen] = useSectionOpen(`view:${id}`, false)
  const empty = threads.length === 0
  const open = stored && !empty
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<SidebarMenuItem />}
    >
      <CollapsibleTrigger
        disabled={empty}
        render={
          <SidebarMenuButton
            className={cn(
              empty &&
                'text-ink-muted disabled:opacity-100 aria-disabled:opacity-100',
            )}
          />
        }
      >
        <span
          aria-hidden
          className={cn(
            'mx-1 size-2 shrink-0 rounded-full',
            empty ? 'border border-separator' : DOT[tone],
            tone === 'running' &&
              !empty &&
              'animate-pulse motion-reduce:animate-none',
          )}
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </CollapsibleTrigger>
      {!empty && (
        <SidebarMenuBadge className="text-ink-muted">
          {threads.length}
        </SidebarMenuBadge>
      )}
      <CollapsiblePanel className={panelMotion}>
        <SidebarMenuSub className="me-0 pe-0">
          {threads.map((thread) => (
            <ThreadRow
              key={thread.threadId}
              thread={thread}
              place={`view:${id}`}
              hint={hint}
            />
          ))}
        </SidebarMenuSub>
      </CollapsiblePanel>
    </Collapsible>
  )
}

const OUTPUT_MARK = {
  app: Icon.Apps,
  artifact: Icon.Artifact,
  upload: Icon.Attachment,
  review: Icon.Compare,
} as const

/** Files and artifact revisions in one project entry, kept out of the conversation tree. */
function AppsAndOutputs({ project }: { project: ProjectEntry }) {
  const [open, setOpen] = useSectionOpen(`outputs:${project.projectId}`, false)
  const outputs = useProjectOutputs(open ? project.projectId : undefined)
  const navigate = useNavigate()
  return (
    <SidebarMenuSubItem className={TREE_TICK}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          render={
            <SidebarMenuSubButton
              render={<button type="button" />}
              className="w-full translate-x-0"
            />
          }
        >
          <Icon.Artifact aria-hidden className="text-ink-muted" />
          <span className="min-w-0 flex-1 truncate text-start">
            Apps &amp; outputs
          </span>
          <span className="pe-1 text-xs text-ink-muted tabular-nums">
            {project.outputCount}
          </span>
        </CollapsibleTrigger>
        <CollapsiblePanel className={panelMotion}>
          <ul className="flex flex-col gap-px ps-3 pt-px">
            {outputs.error && (
              <li className="px-2 py-1 text-xs text-error-ink">
                {describeError(outputs.error)}
              </li>
            )}
            {outputs.data?.items.map((item) => {
              const Mark = OUTPUT_MARK[item.kind]
              return (
                <li key={item.outputId}>
                  <SidebarMenuSubButton
                    size="sm"
                    title={item.title}
                    className="w-full translate-x-0"
                    render={
                      <button
                        type="button"
                        onClick={async () => {
                          useShell.getState().setProjectId(project.projectId)
                          await navigate({
                            to: '/c/$threadId',
                            params: { threadId: item.threadId },
                          })
                          if (item.artifactId)
                            useArtifactView.getState().open(item.artifactId)
                          if (item.reviewId) openReview(item.reviewId)
                        }}
                      />
                    }
                  >
                    <Mark aria-hidden className="size-3.5 text-ink-muted" />
                    <span className="min-w-0 flex-1 truncate text-start">
                      {item.title}
                    </span>
                    {item.revisionCount > 1 && (
                      <span className="text-xs text-ink-muted tabular-nums">
                        {item.revisionCount}
                      </span>
                    )}
                  </SidebarMenuSubButton>
                </li>
              )
            })}
            {outputs.data?.items.length === 0 && (
              <li className="px-2 py-1 text-xs text-ink-muted">
                Nothing produced yet.
              </li>
            )}
          </ul>
        </CollapsiblePanel>
      </Collapsible>
    </SidebarMenuSubItem>
  )
}

/** The rows of a list, forks and continuations nested under their source. */
function ThreadRows({
  threads,
  place,
}: {
  threads: readonly ThreadEntry[]
  place: string
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
        (thread, index) =>
          index < THREADS_SHOWN || thread.threadId === openRoot,
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
  const live = threads.some((t) => t.attention.running)
  const wanting = threads.some((t) => t.attention.reasons.length > 0)
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
            <CollapsibleTrigger
              render={
                <SidebarMenuButton
                  {...listeners}
                  title={project.state?.text ?? project.title}
                  className="pe-8"
                />
              }
            />
          }
        >
          <ProjectGlyph
            glyph={project.glyph}
            open={open}
            aria-hidden
            className="text-ink-muted"
          />
          <span
            className={cn('min-w-0 flex-1 truncate', open && 'font-medium')}
          >
            {project.title}
          </span>
          {!open && (wanting || live) && (
            <span
              aria-hidden
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                wanting ? DOT.attention : DOT.running,
              )}
            />
          )}
        </ContextMenu.Trigger>
        <MenuPopup anchor={undefined} className="min-w-44">
          <MenuItem onClick={() => onNewThread(project.projectId)}>
            <Icon.NewChat className="size-4" />
            New thread here
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
      <ProjectStateDialog
        project={project}
        open={editingState}
        onOpenChange={setEditingState}
      />
      {threads.length > 0 && (
        <SidebarMenuBadge className="text-ink-muted group-hover/menu-item:opacity-0 max-md:hidden">
          {threads.length}
        </SidebarMenuBadge>
      )}
      <SidebarMenuAction
        showOnHover
        aria-label={`New thread in ${project.title}`}
        title={`New thread in ${project.title}`}
        onClick={() => onNewThread(project.projectId)}
      >
        <Icon.Add />
      </SidebarMenuAction>
      <CollapsiblePanel className={panelMotion}>
        <SidebarMenuSub className="me-0 pe-0">
          {starting && <StartingRow />}
          <ThreadRows threads={threads} place={project.projectId} />
          {threads.length === 0 && !starting && (
            <li className="px-2 py-1 text-xs text-ink-muted">
              No threads yet. Drag one here, or start one with +.
            </li>
          )}
          {served && <AppsAndOutputs project={project} />}
        </SidebarMenuSub>
      </CollapsiblePanel>
    </Collapsible>
  )
}

function UnsortedNode({
  threads,
  starting,
}: {
  threads: readonly ThreadEntry[]
  starting: boolean
}) {
  const [stored, setOpen] = useSectionOpen('view:unsorted', false)
  const open = stored || starting
  const {
    setNodeRef: dropRef,
    isOver,
    active,
  } = useDroppable({
    id: 'unsorted',
    data: { projectId: null } satisfies DropTarget,
  })
  const accepting = isOver && takes(active, null)
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={
        <SidebarMenuItem ref={dropRef} className={cn(accepting && dropRing)} />
      }
    >
      <CollapsibleTrigger render={<SidebarMenuButton className="pe-8" />}>
        <Icon.Mail aria-hidden className="text-ink-muted" />
        <span className="min-w-0 flex-1 truncate">Unsorted</span>
      </CollapsibleTrigger>
      {threads.length > 0 && (
        <SidebarMenuBadge className="text-ink-muted">
          {threads.length}
        </SidebarMenuBadge>
      )}
      <CollapsiblePanel className={panelMotion}>
        <SidebarMenuSub className="me-0 pe-0">
          {starting && <StartingRow />}
          <ThreadRows threads={threads} place="unsorted" />
        </SidebarMenuSub>
      </CollapsiblePanel>
    </Collapsible>
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
    <div className="flex h-12 shrink-0 items-center px-1.5">
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              className="h-10 w-full justify-start gap-2 rounded-lg px-2 text-start font-normal hover:bg-hover data-popup-open:bg-hover"
            />
          }
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm leading-tight font-medium">
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

/** Chat's panel: attention views above a stable project tree, the Librarian below, the files folded. */
export function OrganizedPanel({ footer }: { footer?: ReactNode }) {
  const { data, error, isPending } = useOrganization()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const views = useOrganizedViews()
  useRevealOpenThread(views)
  useFreshAfterRuns((threadId) => views.byId.has(threadId))

  const inbox = data?.projects.find((project) => project.isInbox)
  const startingIn = useStartingIn()
  // A chat started outside every project shows under Unsorted until it is filed.
  const startingUnsorted =
    startingIn !== undefined &&
    (startingIn === inbox?.projectId ||
      !views.projects.some((p) => p.project.projectId === startingIn))

  const newThread = (projectId = inbox?.projectId) => {
    const shell = useShell.getState()
    if (projectId) {
      shell.setProjectId(projectId)
      shell.setOrganizeOpen(
        projectId === inbox?.projectId
          ? 'view:unsorted'
          : `project:${projectId}`,
        true,
      )
    }
    void navigate({ to: '/' }).then(() =>
      requestAnimationFrame(() => void focusComposer()),
    )
  }

  const { threadId: openThreadId } = useParams({ strict: false })
  const listRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  useGlideHighlight(listRef, pillRef, HIGHLIGHTED, 'data-organize-row')

  // The arrow keys walk the threads in the order the tree draws them.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if ((event.target as HTMLElement).closest('input, [role="menu"]')) return
    const links =
      listRef.current?.querySelectorAll<HTMLAnchorElement>('a[href^="/c/"]')
    if (!links?.length) return
    const hrefs = [...links].map((link) => link.getAttribute('href') ?? '')
    const focused = (event.target as HTMLElement)
      .closest('a')
      ?.getAttribute('href')
    const selected =
      focused ?? (openThreadId ? `/c/${openThreadId}` : undefined)
    const next = neighbour(hrefs, selected, event.key === 'ArrowDown' ? 1 : -1)
    if (!next) return
    event.preventDefault()
    links[hrefs.indexOf(next)]?.focus()
  }

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
    useShell
      .getState()
      .setOrganizeOpen(
        projectId ? `project:${projectId}` : 'view:unsorted',
        true,
      )
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
    }),
    [data, views],
  )

  return (
    <div className="flex h-full flex-col">
      <WorkspaceHeader
        organization={data}
        onNewProject={() => setCreating(true)}
      />
      <SidebarMenu className="shrink-0 px-2 pb-2">
        <SidebarMenuItem>
          <SidebarMenuButton onClick={() => newThread()}>
            <Icon.NewChat aria-hidden />
            <span>New thread</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => useCommandPalette.getState().setOpen(true)}
          >
            <Icon.Search aria-hidden />
            <span className="min-w-0 flex-1 truncate">Search</span>
            <Kbd>⌘K</Kbd>
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
              className="flex flex-col gap-2"
            >
              <SidebarMenu>
                <QuickView
                  id="attention"
                  label="Attention Worthy"
                  tone="attention"
                  threads={views.attention}
                />
                <QuickView
                  id="running"
                  label="Running"
                  tone="running"
                  threads={views.running}
                />
                <QuickView
                  id="later"
                  label="Later"
                  tone="later"
                  threads={views.later}
                  hint="later"
                />
              </SidebarMenu>
              <SidebarGroup className="border-t border-separator p-0 pt-2">
                <SidebarGroupLabel>Projects</SidebarGroupLabel>
                <SidebarGroupAction
                  aria-label="New project"
                  title="New project"
                  className="top-3.5 right-1"
                  onClick={() => setCreating(true)}
                >
                  <Icon.Add />
                </SidebarGroupAction>
                <SidebarMenu>
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
                  {(views.unsorted.length > 0 ||
                    startingUnsorted ||
                    dragging) && (
                    <UnsortedNode
                      threads={views.unsorted}
                      starting={startingUnsorted}
                    />
                  )}
                </SidebarMenu>
                {(error ?? mover.error) && (
                  <p role="alert" className="px-2 py-1 text-xs text-error-ink">
                    {describeError(error ?? mover.error)}
                  </p>
                )}
              </SidebarGroup>
            </div>
            <DragOverlay dropAnimation={null}>
              {dragging && (
                <div className="flex h-7 max-w-56 items-center gap-2 rounded-lg bg-raised px-2 text-sm shadow-md ring-1 ring-separator">
                  <ThreadGlyph
                    glyph={dragging.thread.glyph}
                    aria-hidden
                    className="size-4 shrink-0 text-ink-muted"
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
      {data?.served && <LibrarianFooter librarian={data.librarian} />}
      {footer}
      <NewProjectDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(projectId) => newThread(projectId)}
      />
    </div>
  )
}
