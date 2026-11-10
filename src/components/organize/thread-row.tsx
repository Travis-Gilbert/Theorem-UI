// SOURCING: coss ui sidebar and collapsible, @dnd-kit/core useDraggable (a row carries its thread to another project), Base UI ContextMenu with coss menu parts, @tanstack/react-router Link, assistant-ui (the open thread's run state and reload), thread-tree (branches and forks, as the previous thread list read them), date-fns for a sleeping thread's wake time
import { useAui, useAuiState } from '@assistant-ui/react'
import { ContextMenu } from '@base-ui/react/context-menu'
import { useDraggable } from '@dnd-kit/core'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { format, isToday, isTomorrow } from 'date-fns'
import { useContext, createContext, useEffect, useRef, useState } from 'react'
import {
  OriginMark,
  ThreadBranchRow,
  TreeGuide,
  originLabel,
} from '@/components/assistant-ui/elements/thread-list.aui'
import { Badge } from '@/components/coss/badge'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/coss/collapsible'
import { Input } from '@/components/coss/input'
import { Menu, MenuPopup, MenuTrigger } from '@/components/coss/menu'
import {
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/coss/sidebar'
import { Icon } from '@/components/icons'
import { useShell } from '@/components/shell/shell-state'
import { useSeen } from '@/hooks/use-seen'
import {
  attentionLabel,
  primaryProjectId,
  useThreadEdits,
  useMarkSeen,
} from '@/lib/theorem/organization'
import type {
  Later,
  OrganizedViews,
  ProjectEntry,
  ThreadEntry,
} from '@/lib/theorem/organization'
import {
  useSelectBranch,
  useStartThreadFrom,
  useThreadTree,
} from '@/lib/theorem/thread-tree'
import { cn } from '@/lib/utils'
import { ThreadGlyph } from './glyphs'
import { ThreadMenuItems } from './thread-menu'

/** What every row needs from the sidebar, so a tree does not pass it through each level. */
/** The branch from the tree's guide line to a row. */
export const TREE_TICK =
  'relative before:pointer-events-none before:absolute before:top-1/2 before:-start-2.5 before:w-2 before:border-t before:border-sidebar-border'

/** What a dragged row carries: the thread, and the project it was listed under. */
export type RowDrag = { thread: ThreadEntry; from: string }

export type TreeContext = {
  projects: readonly ProjectEntry[]
  views: OrganizedViews
  served: boolean
}

export const OrganizeTree = createContext<TreeContext | null>(null)

const useTree = () => {
  const tree = useContext(OrganizeTree)
  if (!tree)
    throw new Error('A thread row renders inside the organized sidebar')
  return tree
}

const wakeLabel = (later: Later, views: OrganizedViews) => {
  if (later.condition.kind === 'thread') {
    const title = views.byId.get(later.condition.threadId)?.title
    return title ? `after ${title}` : 'after a run'
  }
  const at = new Date(later.condition.atMs)
  if (isToday(at)) return format(at, 'p')
  if (isTomorrow(at)) return 'tomorrow'
  return format(at, 'MMM d')
}

/** The row's compact status. Its width is the only thing that changes when it does. */
function StatusMark({
  thread,
  running,
  hint,
}: {
  thread: ThreadEntry
  running: boolean
  hint?: string
}) {
  const [reason] = thread.attention.reasons
  if (hint)
    return (
      <span className="max-w-24 shrink-0 truncate text-xs text-ink-muted group-hover/thread:invisible group-has-data-popup-open/thread:invisible">
        {hint}
      </span>
    )
  if (reason?.kind === 'failed')
    return (
      <span className="flex size-5 shrink-0 items-center justify-center group-hover/thread:invisible group-has-data-popup-open/thread:invisible">
        <span aria-hidden className="size-2 rounded-full bg-attention" />
        <span className="sr-only">, failed</span>
      </span>
    )
  if (reason)
    return (
      <Badge className="bg-attention/18 text-sm text-attention-ink group-hover/thread:invisible group-has-data-popup-open/thread:invisible">
        {attentionLabel(reason)}
      </Badge>
    )
  if (running)
    return (
      <span className="flex size-5 shrink-0 items-center justify-center group-hover/thread:invisible group-has-data-popup-open/thread:invisible">
        <span
          aria-hidden
          className="size-1.5 animate-pulse rounded-full bg-teal motion-reduce:animate-none dark:bg-teal-ink"
        />
        <span className="sr-only">, running</span>
      </span>
    )
  return null
}

function RenameField({
  title,
  onDone,
  onCommit,
}: {
  title: string
  onDone: () => void
  onCommit: (title: string) => void
}) {
  const [value, setValue] = useState(title)
  const settled = useRef(false)
  const commit = () => {
    if (settled.current) return
    settled.current = true
    const next = value.trim()
    if (next && next !== title) onCommit(next)
    onDone()
  }
  return (
    <Input
      autoFocus
      size="sm"
      aria-label="Rename thread"
      value={value}
      className="h-7"
      onFocus={(event) => event.target.select()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Enter') commit()
        else if (event.key === 'Escape') {
          settled.current = true
          onDone()
        }
      }}
    />
  )
}

/**
 * One thread where it is listed. A thread in several projects shows in each;
 * the pill glides to the one in its primary project and the others tint, so
 * every occurrence reads as open. Branches and forked threads open under it.
 */
export function ThreadRow({
  thread,
  place,
  childThreads = [],
  childrenOf,
  hint,
}: {
  thread: ThreadEntry
  /** The project this occurrence is listed under, or a quick view. */
  place: string
  childThreads?: readonly ThreadEntry[]
  /** Every thread's forks and continuations in this list, so a fork of a fork nests too. */
  childrenOf?: ReadonlyMap<string, readonly ThreadEntry[]>
  hint?: 'reason' | 'later'
}) {
  const { projects, views, served } = useTree()
  const aui = useAui()
  const navigate = useNavigate()
  const { threadId: openId } = useParams({ strict: false })
  const isOpen = openId === thread.threadId
  const openHere = useAuiState((s) => s.thread.isRunning)
  const running = thread.attention.running || (isOpen && openHere)

  const ref = useRef<HTMLLIElement>(null)
  const seen = useSeen(ref)
  const { data: tree } = useThreadTree(thread.threadId, seen)
  const forks = tree?.forks ?? []
  const onFork = tree ? tree.selectedBranchId !== tree.rootBranchId : false
  const hasChildren = forks.length > 0 || childThreads.length > 0
  const [expanded, setExpanded] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const {
    setNodeRef: dragRef,
    listeners: dragListeners,
    isDragging,
  } = useDraggable({
    id: `${place}|${thread.threadId}`,
    data: { thread, from: place } satisfies RowDrag,
    disabled: renaming,
  })

  const selectBranch = useSelectBranch()
  const startThread = useStartThreadFrom()
  const edits = useThreadEdits()
  const canStartFrom = !running && !startThread.isPending

  const leave = () => {
    if (isOpen) void navigate({ to: '/' })
  }
  const toProject = () =>
    useShell.getState().setProjectId(primaryProjectId(thread))

  const openBranch = async (branchId: string) => {
    if (!tree) return
    const changed = tree.selectedBranchId !== branchId
    if (changed)
      try {
        await selectBranch.mutateAsync({ threadId: thread.threadId, branchId })
      } catch {
        // The selection rolls back, so the highlight stays where Theorem has it.
        return
      }
    if (!isOpen) {
      toProject()
      void navigate({
        to: '/c/$threadId',
        params: { threadId: thread.threadId },
      })
    } else if (changed) await aui.threads.reloadMainThread()
  }

  // A row in the primary project takes the gliding pill, the rest tint.
  const current = isOpen && !onFork
  const primary = place === primaryProjectId(thread)
  const hintText = !hint
    ? undefined
    : hint === 'later' && thread.later
      ? wakeLabel(thread.later, views)
      : undefined

  const items = (
    <ThreadMenuItems
      thread={thread}
      projects={projects}
      running={views.running}
      served={served}
      canStartFrom={canStartFrom}
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

  const title = thread.title || 'New chat'
  return (
    <SidebarMenuSubItem ref={ref} className={cn('group/thread', TREE_TICK)}>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <ContextMenu.Root>
          <ContextMenu.Trigger
            render={<div className="relative flex items-center" />}
          >
            {renaming ? (
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
            ) : (
              <SidebarMenuSubButton
                ref={dragRef}
                {...dragListeners}
                data-organize-row={
                  current ? (primary ? 'primary' : 'also') : undefined
                }
                aria-current={current || undefined}
                title={thread.summary?.text ?? title}
                className={cn(
                  'w-full translate-x-0 pe-1 data-[organize-row=also]:bg-hover',
                  'relative z-[1] hover:bg-hover',
                  isDragging && 'opacity-40',
                )}
                render={
                  <Link
                    draggable={false}
                    to="/c/$threadId"
                    params={{ threadId: thread.threadId }}
                    onClick={(event) => {
                      toProject()
                      // The row is the root branch: reopen it when a fork is selected.
                      if (!tree || !onFork || running) return
                      event.preventDefault()
                      void openBranch(tree.rootBranchId)
                    }}
                  />
                }
              >
                {thread.origin ? (
                  <OriginMark kind={thread.origin.kind} />
                ) : (
                  <ThreadGlyph
                    glyph={thread.glyph}
                    aria-hidden
                    className="text-ink-muted"
                  />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {title}
                  {thread.origin && (
                    <span className="sr-only">
                      , {originLabel[thread.origin.kind]}
                    </span>
                  )}
                </span>
                <StatusMark thread={thread} running={running} hint={hintText} />
              </SidebarMenuSubButton>
            )}
            {!renaming && (
              <span className="absolute inset-y-0 end-0.5 z-[2] flex items-center gap-0.5">
                {hasChildren && (
                  <CollapsibleTrigger
                    aria-label={expanded ? 'Collapse' : 'Expand'}
                    className="group/branches hidden size-5 items-center justify-center rounded-sm text-ink-muted group-hover/thread:flex hover:text-ink focus-visible:flex focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <Icon.ChevronRight className="size-3.5 transition-transform duration-(--duration-snap) ease-snap group-data-panel-open/branches:rotate-90" />
                  </CollapsibleTrigger>
                )}
                <Menu>
                  <MenuTrigger
                    aria-label={`More options for ${title}`}
                    className="flex size-5 items-center justify-center rounded-sm text-ink-muted opacity-0 outline-none group-hover/thread:opacity-100 hover:bg-selected hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus data-popup-open:bg-selected data-popup-open:opacity-100"
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
        {hasChildren && (
          <CollapsiblePanel className="duration-(--duration-glide) ease-glide data-ending-style:duration-(--duration-exit) data-ending-style:ease-exit">
            {forks.map((branch, index) => (
              <ThreadBranchRow
                key={branch.branchId}
                threadId={thread.threadId}
                branch={branch}
                ordinal={index + 2}
                isLast={index === forks.length - 1 && childThreads.length === 0}
                isCurrent={isOpen && tree?.selectedBranchId === branch.branchId}
                disabled={running}
                onOpen={() => void openBranch(branch.branchId)}
              />
            ))}
            {childThreads.map((child, position) => (
              <div key={child.threadId} className="relative ps-6">
                <TreeGuide isLast={position === childThreads.length - 1} />
                <ul>
                  <ThreadRow
                    thread={child}
                    place={place}
                    childThreads={childrenOf?.get(child.threadId)}
                    childrenOf={childrenOf}
                  />
                </ul>
              </div>
            ))}
          </CollapsiblePanel>
        )}
      </Collapsible>
    </SidebarMenuSubItem>
  )
}

/** Keeps a thread's project open when that thread becomes the open one. */
export function useRevealOpenThread(views: OrganizedViews) {
  const { threadId } = useParams({ strict: false })
  const thread = threadId ? views.byId.get(threadId) : undefined
  const primary = thread && primaryProjectId(thread)
  // Having opened a failed thread is having seen the failure. Asked for once per failure.
  const failedAt = thread?.attention.reasons.find(
    (reason) => reason.kind === 'failed',
  )?.atMs
  const { mutate: markSeen } = useMarkSeen()
  useEffect(() => {
    if (threadId && failedAt) markSeen(threadId)
  }, [threadId, failedAt, markSeen])
  useEffect(() => {
    if (!primary) return
    const { setOrganizeOpen } = useShell.getState()
    setOrganizeOpen(`project:${primary}`, true)
    if (views.unsorted.some((t) => t.threadId === threadId))
      setOrganizeOpen('view:unsorted', true)
  }, [threadId, primary, views.unsorted])
}
