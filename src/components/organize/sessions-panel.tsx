// SOURCING: coss ui sidebar, collapsible, menu, input and alert dialog over Base UI, lucide-react (the Files heading's new file, new folder and collapse), Base UI ContextMenu (a row's right-click), @tanstack/react-router, @tanstack/react-query (the organization's freshness), assistant-ui (the open session's run state), useGlideHighlight from components/motion, lib/theorem/organization (sessions are Theorem's threads; the user's sections are the projects the user made), date-fns formatDistanceToNowStrict for when a session last moved, thread-menu's ThreadMenuItems and thread-row's RenameField (sessions and sections both rename in place), the IDE's file tree (ide-file-tree.tsx) under the sessions, in a dockview-react SplitviewReact whose line between them drags. The structure (a workspace row with search and collapse; Sessions, Automations, Review and Wiki; a bold Sessions heading with search, add and more; the user's own sections; Recent) is Devin's sidebar from the user's screens, docs/plans/ide-agent-workspace.md.
//
// The IDE's panel. A session opens beside the IDE rather than in chat, so a
// click sets the conversation the IDE page shows and Theia stays where it is.
import { useAuiState } from '@assistant-ui/react'
import { ContextMenu } from '@base-ui/react/context-menu'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNowStrict } from 'date-fns'
import { LayoutPriority, Orientation, SplitviewReact } from 'dockview-react'
import type { SplitviewApi, SplitviewReadyEvent } from 'dockview-react'
import { ChevronsDownUp, FilePlus, FolderPlus } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ComponentType, KeyboardEvent, ReactNode, SVGProps } from 'react'
import { ThreadFromFailure } from '@/components/assistant-ui/elements/thread-list.aui'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/coss/alert-dialog'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/coss/collapsible'
import { Input } from '@/components/coss/input'
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/coss/menu'
import {
  SidebarContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/coss/sidebar'
import { Icon } from '@/components/icons'
import { workspaceIdOf } from '@/components/ide/follow'
import { IdeFileTree } from '@/components/ide/ide-file-tree'
import type { IdeFileTreeHandle } from '@/components/ide/ide-file-tree'
import { useGlideHighlight } from '@/components/motion'
import { useCommandPalette } from '@/components/shell/command-palette'
import { useActiveProject } from '@/components/shell/projects'
import { useShell } from '@/components/shell/shell-state'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import { neighbour } from '@/lib/theorem/row-neighbour'
import {
  attentionLabel,
  lastMoved,
  organizationKey,
  sessionLists,
  useOrganization,
  useOrganizedViews,
  useProjectEdits,
  useThreadEdits,
} from '@/lib/theorem/organization'
import type { ProjectEntry, ThreadEntry } from '@/lib/theorem/organization'
import { useStartThreadFrom } from '@/lib/theorem/thread-tree'
import { cn } from '@/lib/utils'
import { ProjectGlyph, SessionGlyph } from './glyphs'
import { NewProjectDialog } from './new-project-dialog'
import { ThreadMenuItems } from './thread-menu'
import { RenameField } from './thread-row'

const ICON_BUTTON =
  'flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus aria-pressed:text-ink data-popup-open:bg-hover'
const panelMotion =
  'duration-(--duration-glide) ease-glide data-ending-style:duration-(--duration-exit) data-ending-style:ease-exit'

/** Sessions a section lists before "Show more", so one long section does not push the rest away. */
const SECTION_SHOWN = 4
/** Sessions Recent lists before "Show more". */
const RECENT_SHOWN = 8

/** Remembers a section being open, per browser, with a default until it is touched. */
function useSectionOpen(key: string, fallback: boolean) {
  const open = useShell((s) => s.organizeOpen[key] ?? fallback)
  const set = useShell((s) => s.setOrganizeOpen)
  const setOpen = useCallback((next: boolean) => set(key, next), [set, key])
  return [open, setOpen] as const
}

type SessionsContext = {
  projects: readonly ProjectEntry[]
  running: readonly ThreadEntry[]
  served: boolean
  /** Where each session's pill sits when it is open: its first section, or Recent. */
  home: ReadonlyMap<string, string>
}
const Sessions = createContext<SessionsContext | null>(null)
const useSessions = () => {
  const context = useContext(Sessions)
  if (!context)
    throw new Error('A session row renders inside the sessions panel')
  return context
}

/** The second line of a row: working, what it waits on, or when it last moved. */
function SessionStatus({
  thread,
  running,
}: {
  thread: ThreadEntry
  running: boolean
}) {
  const [reason] = thread.attention.reasons
  if (reason)
    return (
      <span className="flex items-center gap-1.5 text-attention-ink">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-attention"
        />
        {attentionLabel(reason)}
      </span>
    )
  if (running)
    return (
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-1.5 shrink-0 animate-pulse rounded-full bg-teal motion-reduce:animate-none dark:bg-teal-ink"
        />
        Working
      </span>
    )
  return (
    <>{formatDistanceToNowStrict(lastMoved(thread), { addSuffix: true })}</>
  )
}

/** One session where it is listed. A click opens it beside the IDE. */
function SessionRow({ thread, place }: { thread: ThreadEntry; place: string }) {
  const { projects, running: runningThreads, served, home } = useSessions()
  const openId = useShell((s) => s.chatThreadId)
  const isOpen = openId === thread.threadId
  const openRunning = useAuiState((s) => s.thread.isRunning)
  const running = thread.attention.running || (isOpen && openRunning)
  const [renaming, setRenaming] = useState(false)
  const edits = useThreadEdits()
  const startThread = useStartThreadFrom()
  const leave = () => {
    if (isOpen) useShell.getState().setChatThreadId(undefined)
  }
  const title = thread.title || 'New chat'

  const items = (
    <ThreadMenuItems
      thread={thread}
      projects={projects}
      running={runningThreads}
      served={served}
      canStartFrom={!running && !startThread.isPending}
      onFork={() =>
        startThread.mutate({ kind: 'forked', threadId: thread.threadId })
      }
      onContinue={() =>
        startThread.mutate({ kind: 'continued', threadId: thread.threadId })
      }
      onRename={() => setRenaming(true)}
      onArchive={() => {
        edits.archive.mutate(thread.threadId)
        leave()
      }}
      onDelete={() => {
        edits.remove.mutate(thread.threadId)
        leave()
      }}
    />
  )

  // A session in two sections shows in both; the pill takes its home, the other tints.
  const mark = isOpen
    ? place === 'review' || home.get(thread.threadId) === place
      ? 'primary'
      : 'also'
    : undefined
  return (
    <li className="group/session">
      <ContextMenu.Root>
        <ContextMenu.Trigger render={<div className="relative" />}>
          {renaming ? (
            <div className="px-1 py-2">
              <RenameField
                title={thread.title}
                onDone={() => setRenaming(false)}
                onCommit={(next) =>
                  edits.rename.mutate({
                    threadId: thread.threadId,
                    title: next,
                  })
                }
              />
            </div>
          ) : (
            <button
              type="button"
              data-session-row={mark}
              data-session={thread.threadId}
              aria-current={isOpen || undefined}
              title={thread.summary?.text ?? title}
              onClick={() =>
                useShell.getState().setChatThreadId(thread.threadId)
              }
              className="relative z-[1] flex w-full min-w-0 items-start gap-2.5 rounded-lg px-2 py-1.5 pe-8 text-start outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus data-[session-row=also]:bg-hover"
            >
              <SessionGlyph
                threadId={thread.threadId}
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-ink-muted"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-base leading-snug text-ink">
                  {title}
                </span>
                <span className="truncate text-sm leading-snug text-ink-muted">
                  <SessionStatus thread={thread} running={running} />
                </span>
              </span>
            </button>
          )}
          {!renaming && (
            <span className="absolute top-1.5 end-1 z-[2]">
              <Menu>
                <MenuTrigger
                  aria-label={`More options for ${title}`}
                  className="flex size-6 items-center justify-center rounded-md text-ink-muted opacity-0 outline-none group-hover/session:opacity-100 hover:bg-selected hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus data-popup-open:bg-selected data-popup-open:opacity-100"
                >
                  <Icon.More className="size-3.5" />
                </MenuTrigger>
                <MenuPopup side="right" align="start" className="min-w-48">
                  {items}
                </MenuPopup>
              </Menu>
            </span>
          )}
        </ContextMenu.Trigger>
        <MenuPopup
          anchor={undefined}
          className="min-w-48"
          side="bottom"
          align="start"
        >
          {items}
        </MenuPopup>
      </ContextMenu.Root>
    </li>
  )
}

/** A list's first few sessions, the open one wherever it is, and "Show more" for the rest. */
function SessionList({
  threads,
  place,
  shown,
}: {
  threads: readonly ThreadEntry[]
  place: string
  shown: number
}) {
  const openId = useShell((s) => s.chatThreadId)
  const [showAll, setShowAll] = useState(false)
  const visible = showAll
    ? threads
    : threads.filter(
        (thread, index) => index < shown || thread.threadId === openId,
      )
  const hidden = threads.length - visible.length
  return (
    <ul className="flex flex-col gap-0.5">
      {visible.map((thread) => (
        <SessionRow key={thread.threadId} thread={thread} place={place} />
      ))}
      {hidden > 0 && (
        <li>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex h-8 w-full items-center rounded-lg px-2 ps-8.5 text-sm text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            Show {hidden} more
          </button>
        </li>
      )}
    </ul>
  )
}

/** What a section the user made offers on its heading: a new name, or going. */
type SectionEdits = {
  onRename: (title: string) => void
  onDelete: () => void
}

/**
 * A heading that folds its list away, with the session count and an add
 * button. A section the user made renames on a double-click or from its
 * right-click menu, which also deletes it.
 */
function Section({
  id,
  title,
  glyph,
  threads,
  shown,
  onNew,
  edits,
}: {
  id: string
  title: string
  glyph?: ReactNode
  threads: readonly ThreadEntry[]
  shown: number
  onNew?: () => void
  edits?: SectionEdits
}) {
  const [open, setOpen] = useSectionOpen(`ide:${id}`, true)
  const [renaming, setRenaming] = useState(false)
  const heading = renaming ? (
    <div className="flex h-8 items-center gap-2 px-1">
      {glyph}
      <RenameField
        title={title}
        label="Rename section"
        onDone={() => setRenaming(false)}
        onCommit={(next) => edits?.onRename(next)}
      />
    </div>
  ) : (
    <div className="group/section relative flex items-center">
      <CollapsibleTrigger
        onDoubleClick={edits ? () => setRenaming(true) : undefined}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 pe-2.5 text-start text-sm text-ink-muted outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        {glyph}
        <span className="min-w-0 truncate font-medium">{title}</span>
        <Icon.ChevronRight
          aria-hidden
          className={cn(
            'size-3 shrink-0 transition-transform duration-(--duration-snap) ease-snap',
            open && 'rotate-90',
          )}
        />
        <span
          className={cn(
            'ms-auto tabular-nums',
            onNew && 'group-hover/section:invisible',
          )}
        >
          {threads.length || ''}
        </span>
      </CollapsibleTrigger>
      {onNew && (
        <button
          type="button"
          aria-label={`New session in ${title}`}
          title={`New session in ${title}`}
          onClick={onNew}
          className="absolute end-1 flex size-6 items-center justify-center rounded-md text-ink-muted opacity-0 outline-none group-hover/section:opacity-100 hover:bg-hover hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Icon.Add className="size-3.5" />
        </button>
      )}
    </div>
  )
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {edits ? (
        <ContextMenu.Root>
          <ContextMenu.Trigger render={<div />}>{heading}</ContextMenu.Trigger>
          <MenuPopup
            anchor={undefined}
            className="min-w-44"
            side="bottom"
            align="start"
          >
            <MenuItem onClick={() => setRenaming(true)}>
              <Icon.Edit className="size-4" />
              Rename section
            </MenuItem>
            <MenuItem variant="destructive" onClick={edits.onDelete}>
              <Icon.Delete className="size-4" />
              Delete section
            </MenuItem>
          </MenuPopup>
        </ContextMenu.Root>
      ) : (
        heading
      )}
      <CollapsiblePanel className={panelMotion}>
        <SessionList threads={threads} place={id} shown={shown} />
      </CollapsiblePanel>
    </Collapsible>
  )
}

/**
 * The open project's files under the sessions, drawn by the page while Theia
 * shows only its editors. It fills its side of SessionsSplit, whose
 * separator draws the line above it; folded, it is its heading.
 */
function FilesSection({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const tree = useRef<IdeFileTreeHandle>(null)
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="flex h-11 shrink-0 items-center gap-0.5 px-1.5 ps-2">
        <CollapsibleTrigger className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-start text-md font-semibold text-ink outline-none focus-visible:outline-2 focus-visible:outline-focus">
          <span className="min-w-0 truncate">Files</span>
          <Icon.ChevronRight
            aria-hidden
            className={cn(
              'size-3 shrink-0 text-ink-muted transition-transform duration-(--duration-snap) ease-snap',
              open && 'rotate-90',
            )}
          />
        </CollapsibleTrigger>
        {open && (
          <>
            <button
              type="button"
              aria-label="New file"
              title="New file"
              onClick={() => tree.current?.create('file')}
              className={ICON_BUTTON}
            >
              <FilePlus aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              aria-label="New folder"
              title="New folder"
              onClick={() => tree.current?.create('folder')}
              className={ICON_BUTTON}
            >
              <FolderPlus aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Collapse folders"
              title="Collapse folders"
              onClick={() => tree.current?.collapseAll()}
              className={ICON_BUTTON}
            >
              <ChevronsDownUp aria-hidden className="size-4" />
            </button>
          </>
        )}
      </div>
      <CollapsiblePanel className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <IdeFileTree
          key={workspaceId}
          workspaceId={workspaceId}
          handle={tree}
        />
      </CollapsiblePanel>
    </Collapsible>
  )
}

/** The Files heading's height (its h-11); folded, Files is only its heading. */
const FILES_HEADING = 44
/** The least Files keeps open while the line above it is dragged: its heading and a few rows. */
const FILES_MIN = FILES_HEADING + 72
/** The least the sessions keep above it. */
const SESSIONS_MIN = 96

type SplitPanes = { sessions: ReactNode; files: ReactNode }
const SplitPanesContext = createContext<SplitPanes | null>(null)

function SessionsPane() {
  return (
    <div className="flex h-full flex-col">
      {useContext(SplitPanesContext)?.sessions}
    </div>
  )
}

function FilesPane() {
  return useContext(SplitPanesContext)?.files ?? null
}

const splitPanes = { sessions: SessionsPane, files: FilesPane }

/**
 * The sessions over the open project's files. The line between them drags,
 * and the height Files is left at is the height it reopens with. Folded,
 * Files keeps only its heading; with no project open it is not there.
 */
function SessionsSplit({ sessions }: { sessions: ReactNode }) {
  const { project } = useActiveProject()
  const [filesOpen, setFilesOpen] = useSectionOpen('ide:files', true)
  const [split, setSplit] = useState<SplitviewApi>()

  const onReady = ({ api }: SplitviewReadyEvent) => {
    const files =
      useShell.getState().ideFilesHeight ?? Math.round(api.height / 2)
    // Sized together, so adding the second does not redistribute the first.
    api.addPanel({
      id: 'sessions',
      component: 'sessions',
      size: api.height - files,
      minimumSize: SESSIONS_MIN,
      priority: LayoutPriority.High,
    })
    api.addPanel({
      id: 'files',
      component: 'files',
      size: files,
      minimumSize: FILES_HEADING,
      priority: LayoutPriority.Low,
    })
    setSplit(api)
  }

  useEffect(() => {
    const files = split?.getPanel('files')
    if (!split || !files) return
    files.api.setVisible(Boolean(project))
    if (filesOpen) {
      files.api.setConstraints({
        minimumSize: FILES_MIN,
        maximumSize: Number.POSITIVE_INFINITY,
      })
      files.api.setSize({
        size:
          useShell.getState().ideFilesHeight ?? Math.round(split.height / 2),
      })
    } else {
      files.api.setConstraints({
        minimumSize: FILES_HEADING,
        maximumSize: FILES_HEADING,
      })
      files.api.setSize({ size: FILES_HEADING })
    }
  }, [split, project, filesOpen])

  // The height a drag leaves Files at, while it is open, is the one it reopens
  // with. The split reports a layout change only when a drag of its line ends,
  // so the panel resizing with the window never overwrites it.
  useEffect(() => {
    if (!split) return
    const listener = split.onDidLayoutChange(() => {
      const files = split.getPanel('files')
      const shell = useShell.getState()
      if (
        files?.api.isVisible &&
        (shell.organizeOpen['ide:files'] ?? true) &&
        files.api.height > FILES_HEADING
      )
        shell.setIdeFilesHeight(Math.round(files.api.height))
    })
    return () => listener.dispose()
  }, [split])

  const panes = useMemo(
    () => ({
      sessions,
      files: project && (
        <FilesSection
          key={project.projectId}
          workspaceId={workspaceIdOf(project.projectId)}
          open={filesOpen}
          onOpenChange={setFilesOpen}
        />
      ),
    }),
    [sessions, project, filesOpen, setFilesOpen],
  )

  return (
    <SplitPanesContext.Provider value={panes}>
      <div className="min-h-0 flex-1">
        <SplitviewReact
          className="dockview-theme-theorem h-full w-full"
          orientation={Orientation.VERTICAL}
          proportionalLayout={false}
          components={splitPanes}
          onReady={onReady}
        />
      </div>
    </SplitPanesContext.Provider>
  )
}

/** A row of the nav at the top. The active one carries the pill. */
function NavRow({
  label,
  Mark,
  active = false,
  count,
  onClick,
}: {
  label: string
  Mark: ComponentType<SVGProps<SVGSVGElement>>
  active?: boolean
  count?: number
  onClick: () => void
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        data-sessions-nav={active ? 'primary' : undefined}
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
        className="relative z-[1] h-9 text-base text-ink"
      >
        <Mark aria-hidden className="size-[18px]! shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </SidebarMenuButton>
      {count ? (
        <SidebarMenuBadge className="z-[1] text-sm text-attention-ink tabular-nums">
          {count}
        </SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  )
}

/** Keeps the lists honest about what this tab just did: a new session, a run ending. */
function useFreshAfterRuns(missing: boolean) {
  const client = useQueryClient()
  const running = useAuiState((s) => s.thread.isRunning)
  useEffect(() => {
    void client.invalidateQueries({ queryKey: organizationKey })
  }, [client, running, missing])
}

/**
 * The IDE's sessions: the workspace, the places to go, then the sessions in
 * the sections the user made and the rest by when they last moved. The
 * workspace switcher comes from the shell, which owns how a project opens.
 */
/**
 * A section rename or delete the server refused or never got: why, with the
 * same edit to try again. The rename field and the delete dialog have closed
 * by then, so this is the only place the person learns nothing changed.
 */
export function FailedSectionEdits({
  edits,
  projects,
}: {
  edits: ReturnType<typeof useProjectEdits>
  projects: ReadonlyArray<Pick<ProjectEntry, 'projectId' | 'title'>>
}) {
  const { rename, archive } = edits
  const titleOf = (projectId: string) =>
    projects.find((project) => project.projectId === projectId)?.title ||
    'The section'
  const failures = [
    rename.isError && {
      key: 'rename',
      what: `“${titleOf(rename.variables.projectId)}” could not be renamed.`,
      error: rename.error,
      retry: () => rename.mutate(rename.variables),
      dismiss: () => rename.reset(),
    },
    archive.isError && {
      key: 'archive',
      what: `“${titleOf(archive.variables)}” could not be deleted.`,
      error: archive.error,
      retry: () => archive.mutate(archive.variables),
      dismiss: () => archive.reset(),
    },
  ].filter((failure) => failure !== false)
  return failures.map((failure) => (
    <div
      key={failure.key}
      role="alert"
      className="flex items-start gap-1 px-2 py-1 text-xs text-error-ink"
    >
      <p className="min-w-0 flex-1">
        {failure.what} {describeError(failure.error)}
      </p>
      <Button size="xs" variant="ghost" onClick={failure.retry}>
        Try again
      </Button>
      <Button size="xs" variant="ghost" onClick={failure.dismiss}>
        Dismiss
      </Button>
    </div>
  ))
}

export function SessionsPanel({ switcher }: { switcher: ReactNode }) {
  const { data, error, isPending } = useOrganization()
  const views = useOrganizedViews()
  const navigate = useNavigate()
  const openId = useShell((s) => s.chatThreadId)
  const projectEdits = useProjectEdits()
  const [doomed, setDoomed] = useState<ProjectEntry>()
  const [view, setView] = useState<'sessions' | 'review'>('sessions')
  const [filtering, setFiltering] = useState(false)
  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)
  useFreshAfterRuns(openId !== undefined && !views.byId.has(openId))

  const newSession = (projectId?: string) => {
    const shell = useShell.getState()
    if (projectId) shell.setProjectId(projectId)
    shell.setChatThreadId(undefined)
  }

  const query = filter.trim().toLowerCase()
  const matches = (thread: ThreadEntry) =>
    !query || (thread.title || 'New chat').toLowerCase().includes(query)

  const lists = useMemo(() => sessionLists(views), [views])

  const context = useMemo(
    () => ({
      projects: data?.projects ?? [],
      running: views.running,
      served: data?.served ?? false,
      home: lists.home,
    }),
    [data, views.running, lists.home],
  )

  const navRef = useRef<HTMLDivElement>(null)
  const navPill = useRef<HTMLDivElement>(null)
  useGlideHighlight(
    navRef,
    navPill,
    '[data-sessions-nav="primary"]',
    'data-sessions-nav',
  )
  const listRef = useRef<HTMLDivElement>(null)
  const rowPill = useRef<HTMLDivElement>(null)
  useGlideHighlight(
    listRef,
    rowPill,
    '[data-session-row="primary"]',
    'data-session-row',
  )

  // The arrow keys walk the sessions in the order the panel draws them.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if ((event.target as HTMLElement).closest('input, [role="menu"]')) return
    const rows =
      listRef.current?.querySelectorAll<HTMLButtonElement>('[data-session]')
    if (!rows?.length) return
    const ids = [...rows].map((row) => row.dataset.session ?? '')
    const focused = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-session]',
    )?.dataset.session
    const next = neighbour(
      ids,
      focused ?? openId,
      event.key === 'ArrowDown' ? 1 : -1,
    )
    if (!next) return
    event.preventDefault()
    rows[ids.indexOf(next)]?.focus()
  }

  const sections = lists.sections
    .map(({ project, threads }) => ({
      project,
      threads: threads.filter(matches),
    }))
    .filter(({ threads }) => !query || threads.length > 0)
  const recent = lists.recent.filter(matches)
  const nothingFound = query && recent.length === 0 && sections.length === 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-0.5 px-1.5">
        <div className="min-w-0 flex-1">{switcher}</div>
        <button
          type="button"
          aria-label="Search workspace"
          title="Search workspace (⌘K)"
          onClick={() => useCommandPalette.getState().setOpen(true)}
          className={ICON_BUTTON}
        >
          <Icon.Search className="size-[18px]" />
        </button>
        <button
          type="button"
          aria-label="Hide the sidebar"
          title="Hide the sidebar"
          onClick={() => useShell.getState().togglePanel('ide')}
          className={ICON_BUTTON}
        >
          <Icon.Panels className="size-[18px]" />
        </button>
      </div>
      <div ref={navRef} className="relative shrink-0 px-2 pb-2">
        <div
          ref={navPill}
          aria-hidden
          style={{ opacity: 0 }}
          className="pointer-events-none absolute rounded-lg bg-selected"
        />
        <SidebarMenu className="gap-0.5">
          <NavRow
            label="Sessions"
            Mark={Icon.Chat}
            active={view === 'sessions'}
            onClick={() => setView('sessions')}
          />
          <NavRow
            label="Automations"
            Mark={Icon.Canvas}
            onClick={() => void navigate({ to: '/canvas' })}
          />
          <NavRow
            label="Review"
            Mark={Icon.Compare}
            active={view === 'review'}
            count={lists.review.length}
            onClick={() => setView('review')}
          />
          <NavRow
            label="Wiki"
            Mark={Icon.Index}
            onClick={() => void navigate({ to: '/index' })}
          />
        </SidebarMenu>
      </div>
      <div className="flex h-11 shrink-0 items-center gap-0.5 border-t border-separator px-1.5 ps-4">
        <h2 className="min-w-0 flex-1 truncate text-md font-semibold text-ink">
          {view === 'sessions' ? 'Sessions' : 'Review'}
        </h2>
        {view === 'sessions' && (
          <>
            <button
              type="button"
              aria-label="Search sessions"
              aria-pressed={filtering}
              title="Search sessions"
              onClick={() => {
                setFiltering(!filtering)
                setFilter('')
              }}
              className={ICON_BUTTON}
            >
              <Icon.Search className="size-4" />
            </button>
            <button
              type="button"
              aria-label="New session"
              title="New session"
              onClick={() => newSession()}
              className={ICON_BUTTON}
            >
              <Icon.Add className="size-4" />
            </button>
            <Menu>
              <MenuTrigger
                aria-label="More"
                title="More"
                className={ICON_BUTTON}
              >
                <Icon.More className="size-4" />
              </MenuTrigger>
              <MenuPopup align="end" className="min-w-44">
                <MenuItem onClick={() => setCreating(true)}>
                  <Icon.Add className="size-4" />
                  New section
                </MenuItem>
              </MenuPopup>
            </Menu>
          </>
        )}
      </div>
      {filtering && view === 'sessions' && (
        <div className="shrink-0 px-2.5 pb-2">
          <Input
            autoFocus
            size="sm"
            aria-label="Search sessions"
            placeholder="Search sessions"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setFilter('')
                setFiltering(false)
              }
            }}
          />
        </div>
      )}
      <SessionsSplit
        sessions={
          <>
            <SidebarContent
              role="navigation"
              aria-label={
                view === 'sessions' ? 'Sessions' : 'Waiting for review'
              }
              className="relative gap-0 px-2 pb-3"
            >
              <div
                ref={rowPill}
                aria-hidden
                style={{ opacity: 0 }}
                className="pointer-events-none absolute rounded-lg bg-selected"
              />
              <Sessions.Provider value={context}>
                <div
                  ref={listRef}
                  onKeyDown={onKeyDown}
                  className="flex flex-col gap-3"
                >
                  {isPending && (
                    <SidebarMenu>
                      {Array.from({ length: 5 }, (_, index) => (
                        <SidebarMenuSkeleton key={index} />
                      ))}
                    </SidebarMenu>
                  )}
                  {view === 'review' ? (
                    lists.review.length > 0 ? (
                      <SessionList
                        threads={lists.review}
                        place="review"
                        shown={lists.review.length}
                      />
                    ) : (
                      !isPending && (
                        <p className="px-2 py-1 text-sm text-ink-muted">
                          Nothing is waiting on you.
                        </p>
                      )
                    )
                  ) : (
                    <>
                      {sections.map(({ project, threads }) => (
                        <Section
                          key={project.projectId}
                          id={project.projectId}
                          title={project.title}
                          glyph={
                            <ProjectGlyph
                              aria-hidden
                              className="size-3.5 shrink-0"
                            />
                          }
                          threads={threads}
                          shown={query ? threads.length : SECTION_SHOWN}
                          onNew={() => newSession(project.projectId)}
                          edits={{
                            onRename: (title) =>
                              projectEdits.rename.mutate({
                                projectId: project.projectId,
                                title,
                              }),
                            onDelete: () => setDoomed(project),
                          }}
                        />
                      ))}
                      {(recent.length > 0 || !query) && !isPending && (
                        <Section
                          id="recent"
                          title="Recent"
                          threads={recent}
                          shown={query ? recent.length : RECENT_SHOWN}
                        />
                      )}
                      {nothingFound && (
                        <p className="px-2 py-1 text-sm text-ink-muted">
                          No session matches “{filter.trim()}”.
                        </p>
                      )}
                    </>
                  )}
                  {error && (
                    <p
                      role="alert"
                      className="px-2 py-1 text-xs text-error-ink"
                    >
                      {describeError(error)}
                    </p>
                  )}
                  <FailedSectionEdits
                    edits={projectEdits}
                    projects={context.projects}
                  />
                </div>
              </Sessions.Provider>
            </SidebarContent>
            <ThreadFromFailure />
          </>
        }
      />
      <AlertDialog
        open={doomed !== undefined}
        onOpenChange={(open) => {
          if (!open) setDoomed(undefined)
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{doomed?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its sessions stay, and any that were only here show in Recent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              Keep
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (doomed) projectEdits.archive.mutate(doomed.projectId)
                setDoomed(undefined)
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      <NewProjectDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(projectId) => newSession(projectId)}
      />
    </div>
  )
}
