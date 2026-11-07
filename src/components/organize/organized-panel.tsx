// SOURCING: coss ui sidebar, collapsible, menu and kbd over Base UI, @tanstack/react-router, the shell's tenant and command palette, useGlideHighlight from components/motion, lib/theorem/organization. The shape (a stable tree with attention views above it and the Librarian below) is the design direction of 2026-11-05, with thread membership translated from mikecann/threadbear@78b77e1 (MIT, Mike Cann).
import { ContextMenu } from '@base-ui/react/context-menu'
import { useAuiState } from '@assistant-ui/react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, KeyboardEvent, ReactNode, SVGProps } from 'react'
import { ThreadFromFailure } from '@/components/assistant-ui/elements/thread-list.aui'
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
import { Search } from 'lucide-react'
import { useGlideHighlight } from '@/components/motion'
import { ProjectGlyph } from './glyphs'
import { ProjectStateDialog } from './project-state-dialog'
import {
  TREE_TICK,
  OrganizeTree,
  ThreadRow,
  useRevealOpenThread,
} from './thread-row'
import { neighbour } from '@/lib/theorem/highlight-finders'
import { useCommandPalette } from '@/components/shell/command-palette'
import { useTenant } from '@/components/shell/projects'
import { useShell } from '@/components/shell/shell-state'
import { describeError } from '@/lib/theorem/client'
import {
  nestByOrigin,
  organizationKey,
  useLibrarianControl,
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

const Chevron = ({ open }: { open: boolean }) => (
  <Icon.ChevronRight
    aria-hidden
    className={cn(
      'size-3.5 shrink-0 text-ink-muted transition-transform duration-(--duration-snap) ease-snap',
      open && 'rotate-90',
    )}
  />
)

/** The tree's rows and counts, at the scale of the reference. */
const ROW = 'h-10 text-md text-ink'
const COUNT =
  'peer-data-[size=default]/menu-button:top-2.5 text-base text-ink-muted'

/** Threads a project lists before "Show more", so one busy project does not push the others away. */
const THREADS_SHOWN = 4

const DOT = {
  attention: 'bg-attention',
  running: 'bg-teal dark:bg-teal-ink',
  later: 'bg-transparent',
} as const

/** One row above the tree: a dot, a name, a count. It opens in place, so the tree stays where it is. */
function QuickView({
  id,
  label,
  tone,
  Mark,
  threads,
  hint,
}: {
  id: string
  label: string
  tone: keyof typeof DOT
  Mark: ComponentType<SVGProps<SVGSVGElement>>
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
            className={cn(ROW, empty && 'text-ink-muted opacity-100')}
          />
        }
      >
        <span
          aria-hidden
          className={cn(
            'mx-0.5 size-1.5 shrink-0 rounded-full',
            !empty && DOT[tone],
            tone === 'running' &&
              !empty &&
              'animate-pulse motion-reduce:animate-none',
          )}
        />
        <Mark aria-hidden className="size-[18px]! shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </CollapsibleTrigger>
      {!empty && (
        <SidebarMenuBadge className={COUNT}>{threads.length}</SidebarMenuBadge>
      )}
      <CollapsiblePanel className={panelMotion}>
        <SidebarMenuSub className="my-0.5 gap-0.5 me-0 pe-0">
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
              className="h-9 w-full translate-x-0 text-md text-ink sm:h-9"
            />
          }
        >
          <Icon.Apps className="size-[18px]! text-ink-muted" />
          <span className="min-w-0 flex-1 truncate text-start">
            Apps &amp; outputs
          </span>
          <span className="pe-1 text-base text-ink-muted tabular-nums">
            {project.outputCount}
          </span>
        </CollapsibleTrigger>
        <CollapsiblePanel className={panelMotion}>
          <ul className="flex flex-col gap-0.5 ps-3 pt-0.5">
            {outputs.error && (
              <li className="px-2 py-1 text-xs text-error-ink">
                {describeError(outputs.error)}
              </li>
            )}
            {outputs.data?.items.map((item) => {
              const Mark = OUTPUT_MARK[item.kind]
              return (
                <li key={item.outputId}>
                  <button
                    type="button"
                    title={item.title}
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
                    className="flex h-7 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-start text-sm outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <Mark className="size-3.5 shrink-0 text-ink-muted" />
                    <span className="min-w-0 flex-1 truncate">
                      {item.title}
                    </span>
                    {item.revisionCount > 1 && (
                      <span className="text-xs text-ink-muted tabular-nums">
                        {item.revisionCount}
                      </span>
                    )}
                  </button>
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
  const shown = showAll
    ? roots
    : roots.filter(
        (thread, index) =>
          index < THREADS_SHOWN || thread.threadId === openThreadId,
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
            className="h-9 translate-x-0 text-sm text-ink-muted sm:h-9"
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
  onNewThread,
  served,
}: {
  project: ProjectEntry
  threads: readonly ThreadEntry[]
  onNewThread: (projectId: string) => void
  served: boolean
}) {
  const [open, setOpen] = useSectionOpen(`project:${project.projectId}`, false)
  const [editingState, setEditingState] = useState(false)
  const live = threads.some((t) => t.attention.running)
  const wanting = threads.some((t) => t.attention.reasons.length > 0)
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<SidebarMenuItem className="group/project" />}
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={
            <CollapsibleTrigger
              render={
                <SidebarMenuButton
                  title={project.state?.text ?? project.title}
                  className={cn(ROW, 'pe-8')}
                />
              }
            />
          }
        >
          <Chevron open={open} />
          <ProjectGlyph
            glyph={project.glyph}
            aria-hidden
            className="size-[18px]! shrink-0 text-ink-muted"
          />
          <span
            className={cn('min-w-0 flex-1 truncate', open && 'font-semibold')}
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
            New thread here
          </MenuItem>
          {served && (
            <MenuItem onClick={() => setEditingState(true)}>
              Where it stands
            </MenuItem>
          )}
        </MenuPopup>
      </ContextMenu.Root>
      <ProjectStateDialog
        project={project}
        open={editingState}
        onOpenChange={setEditingState}
      />
      <SidebarMenuBadge
        className={cn(COUNT, 'group-hover/menu-item:opacity-0 max-md:hidden')}
      >
        {threads.length}
      </SidebarMenuBadge>
      <SidebarMenuAction
        showOnHover
        aria-label={`New thread in ${project.title}`}
        title={`New thread in ${project.title}`}
        className="top-2.5"
        onClick={() => onNewThread(project.projectId)}
      >
        <Icon.Add className="size-3.5" />
      </SidebarMenuAction>
      <CollapsiblePanel className={panelMotion}>
        <SidebarMenuSub className="my-0.5 ms-5 gap-0.5 me-0 pe-0">
          <ThreadRows threads={threads} place={project.projectId} />
          {served && <AppsAndOutputs project={project} />}
        </SidebarMenuSub>
      </CollapsiblePanel>
    </Collapsible>
  )
}

function UnsortedNode({ threads }: { threads: readonly ThreadEntry[] }) {
  const [open, setOpen] = useSectionOpen('view:unsorted', false)
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<SidebarMenuItem />}
    >
      <CollapsibleTrigger
        render={<SidebarMenuButton className={cn(ROW, 'pe-8')} />}
      >
        <Icon.Inbox
          aria-hidden
          className="size-[18px]! shrink-0 text-ink-muted"
        />
        <span className="min-w-0 flex-1 truncate">Unsorted</span>
      </CollapsibleTrigger>
      <SidebarMenuBadge className={COUNT}>{threads.length}</SidebarMenuBadge>
      <CollapsiblePanel className={panelMotion}>
        <SidebarMenuSub className="my-0.5 ms-5 gap-0.5 me-0 pe-0">
          <ThreadRows threads={threads} place="unsorted" />
        </SidebarMenuSub>
      </CollapsiblePanel>
    </Collapsible>
  )
}

function WorkspaceHeader({
  organization,
  onNewThread,
  onNewProject,
}: {
  organization: OrganizationRead | undefined
  onNewThread: () => void
  onNewProject: () => void
}) {
  const tenant = useTenant()
  const control = useLibrarianControl()
  const librarian = organization?.served ? organization.librarian : undefined
  return (
    <div className="flex h-15 shrink-0 items-center gap-1 px-1.5">
      <Menu>
        <MenuTrigger className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-start outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus data-popup-open:bg-hover">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-xl leading-tight font-semibold">
              Theorem
              <Icon.ChevronDown className="size-4 text-ink-muted" />
            </span>
            <span className="truncate text-base leading-tight text-ink-muted">
              Personal workspace
            </span>
          </span>
        </MenuTrigger>
        <MenuPopup align="start" className="min-w-52">
          {tenant && (
            <div className="truncate px-2 pt-1 pb-1.5 text-xs text-ink-muted">
              {tenant}
            </div>
          )}
          <MenuItem onClick={onNewProject}>
            <Icon.Add className="size-4" />
            New project
          </MenuItem>
          {librarian && (
            <MenuItem
              onClick={() => control.mutate({ paused: !librarian.paused })}
            >
              <Icon.Sparkle className="size-4" />
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
      <button
        type="button"
        aria-label="New thread"
        title="New thread"
        onClick={onNewThread}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Icon.NewChat className="size-[18px]" />
      </button>
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
  const newThread = (projectId = inbox?.projectId) => {
    if (projectId) useShell.getState().setProjectId(projectId)
    void navigate({ to: '/' })
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
        onNewThread={() => newThread()}
        onNewProject={() => setCreating(true)}
      />
      <div className="flex shrink-0 flex-col gap-2 px-2.5 pb-3">
        <button
          type="button"
          onClick={() => useCommandPalette.getState().setOpen(true)}
          className="flex h-10 w-full items-center gap-2.5 rounded-lg border border-separator px-3 text-start text-md text-ink-muted outline-none hover:border-control hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Search aria-hidden className="size-[18px] shrink-0" />
          <span className="min-w-0 flex-1 truncate">Search workspace</span>
          <Kbd>⌘K</Kbd>
        </button>
        <button
          type="button"
          onClick={() => newThread()}
          className="flex h-11 w-full items-center gap-2.5 rounded-lg border border-control bg-raised px-3 text-start text-md text-ink outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Icon.Add aria-hidden className="size-4 shrink-0 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate">New thread</span>
        </button>
      </div>
      <SidebarContent
        role="navigation"
        aria-label="Threads"
        className="relative gap-0 px-2 pb-3"
      >
        <div
          ref={pillRef}
          aria-hidden
          style={{ opacity: 0 }}
          className="pointer-events-none absolute rounded-lg bg-selected"
        />
        <OrganizeTree.Provider value={tree}>
          <div
            ref={listRef}
            onKeyDown={onKeyDown}
            className="flex flex-col gap-2"
          >
            <SidebarMenu className="gap-0.5">
              <QuickView
                id="attention"
                label="Attention Worthy"
                tone="attention"
                Mark={Icon.Bell}
                threads={views.attention}
              />
              <QuickView
                id="running"
                label="Running"
                tone="running"
                Mark={Icon.Play}
                threads={views.running}
              />
              <QuickView
                id="later"
                label="Later"
                tone="later"
                Mark={Icon.Moon}
                threads={views.later}
                hint="later"
              />
            </SidebarMenu>
            <SidebarGroup className="border-t border-separator p-0 pt-2">
              <SidebarGroupLabel className="h-10 text-base text-ink">
                Projects
              </SidebarGroupLabel>
              <SidebarGroupAction
                aria-label="New project"
                title="New project"
                className="top-4.5 right-1 text-ink-muted"
                onClick={() => setCreating(true)}
              >
                <Icon.Add className="size-3.5" />
              </SidebarGroupAction>
              <SidebarMenu className="gap-0.5">
                {isPending &&
                  Array.from({ length: 4 }, (_, index) => (
                    <SidebarMenuSkeleton key={index} />
                  ))}
                {views.projects.map(({ project, threads }) => (
                  <ProjectNode
                    key={project.projectId}
                    project={project}
                    threads={threads}
                    served={tree.served}
                    onNewThread={newThread}
                  />
                ))}
                {views.unsorted.length > 0 && (
                  <UnsortedNode threads={views.unsorted} />
                )}
              </SidebarMenu>
              {error && (
                <p role="alert" className="px-2 py-1 text-xs text-error-ink">
                  {describeError(error)}
                </p>
              )}
            </SidebarGroup>
          </div>
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
