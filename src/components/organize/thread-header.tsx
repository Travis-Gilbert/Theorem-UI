// SOURCING: coss ui tabs and menu over Base UI, assistant-ui for the open thread's title, lib/theorem/organization, the same ThreadMenuItems the sidebar's rows open. The view is kept in a small zustand store so the conversation stays mounted behind Highlights.
import { useAuiState } from '@assistant-ui/react'
import { useNavigate, useParams } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { create } from 'zustand'
import { Input } from '@/components/coss/input'
import { Menu, MenuPopup, MenuTrigger } from '@/components/coss/menu'
import { Tabs, TabsList, TabsTab } from '@/components/coss/tabs'
import { Icon } from '@/components/icons'
import {
  primaryProjectId,
  useOrganization,
  useOrganizedViews,
  usePlacement,
  useThreadEdits,
} from '@/lib/theorem/organization'
import { useStartThreadFrom } from '@/lib/theorem/thread-tree'
import { ProjectGlyph } from './glyphs'
import { ThreadMenuItems } from './thread-menu'

export type ThreadView = 'conversation' | 'highlights'

export const useThreadView = create<{
  view: ThreadView
  setView: (view: ThreadView) => void
}>((set) => ({
  view: 'conversation',
  setView: (view) => set({ view }),
}))

const headerButton =
  'flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus data-popup-open:bg-hover'

/** Where the thread sits, what can be done to it, and which of its two views is showing. */
export function ThreadHeader({ actions }: { actions?: ReactNode }) {
  const { threadId } = useParams({ strict: false })
  const title = useAuiState((s) => s.threadListItem.title)
  const running = useAuiState((s) => s.thread.isRunning)
  const { data: organization } = useOrganization()
  const views = useOrganizedViews()
  const navigate = useNavigate()
  const view = useThreadView((s) => s.view)
  const setView = useThreadView((s) => s.setView)
  const placement = usePlacement()
  const edits = useThreadEdits()
  const startThread = useStartThreadFrom()
  const [renaming, setRenaming] = useState(false)

  const thread = threadId ? views.byId.get(threadId) : undefined
  const primary = thread && primaryProjectId(thread)
  const project = organization?.projects.find((p) => p.projectId === primary)
  const pin = thread?.memberships.find((m) => m.projectId === primary)
  const served = organization?.served ?? false
  const shownTitle = thread?.title || title || 'New chat'

  return (
    <header className="flex h-9 shrink-0 items-center gap-1 border-b border-separator ps-3 pe-1 text-sm">
      <nav
        aria-label="Thread location"
        className="flex min-w-0 items-center gap-1.5"
      >
        {project && !project.isInbox && (
          <>
            <span
              title={project.state?.text}
              className="flex max-w-48 shrink-0 items-center gap-1.5 truncate text-ink-muted"
            >
              <ProjectGlyph
                glyph={project.glyph}
                aria-hidden
                className="size-3.5 shrink-0"
              />
              <span className="truncate">{project.title}</span>
            </span>
            <Icon.ChevronRight
              aria-hidden
              className="size-3 shrink-0 text-ink-faint"
            />
          </>
        )}
        {renaming && thread ? (
          <Input
            autoFocus
            size="sm"
            aria-label="Rename thread"
            defaultValue={thread.title}
            className="h-6 max-w-80"
            onFocus={(event) => event.target.select()}
            onBlur={() => setRenaming(false)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Escape') setRenaming(false)
              if (event.key !== 'Enter') return
              const next = event.currentTarget.value.trim()
              if (next && next !== thread.title)
                edits.rename.mutate({
                  threadId: thread.threadId,
                  title: next,
                })
              setRenaming(false)
            }}
          />
        ) : (
          <h1 className="min-w-0 truncate font-medium">{shownTitle}</h1>
        )}
      </nav>
      {thread && served && pin && (
        <button
          type="button"
          aria-pressed={pin.pinned}
          aria-label={
            pin.pinned
              ? `Unpin from ${project?.title}`
              : `Pin to ${project?.title}`
          }
          title={pin.pinned ? 'Pinned to this project' : 'Pin to this project'}
          className={headerButton}
          onClick={() =>
            placement.mutate({
              threadId: thread.threadId,
              change: pin.pinned
                ? { unpin: [pin.projectId] }
                : { pin: [pin.projectId] },
            })
          }
        >
          {pin.pinned ? (
            <Icon.Unpin className="size-4" />
          ) : (
            <Icon.Pin className="size-4" />
          )}
        </button>
      )}
      {thread && (
        <Menu>
          <MenuTrigger aria-label="More" className={headerButton}>
            <Icon.More className="size-4" />
          </MenuTrigger>
          <MenuPopup align="end" className="min-w-48">
            <ThreadMenuItems
              thread={thread}
              projects={organization?.projects ?? []}
              running={views.running}
              served={served}
              canStartFrom={!running && !startThread.isPending}
              onFork={() =>
                startThread.mutate({
                  kind: 'forked',
                  threadId: thread.threadId,
                })
              }
              onContinue={() =>
                startThread.mutate({
                  kind: 'continued',
                  threadId: thread.threadId,
                })
              }
              onRename={() => setRenaming(true)}
              onArchive={() => {
                edits.archive.mutate(thread.threadId)
                void navigate({ to: '/' })
              }}
              onDelete={() => {
                edits.remove.mutate(thread.threadId)
                void navigate({ to: '/' })
              }}
            />
          </MenuPopup>
        </Menu>
      )}
      <Tabs
        value={view}
        onValueChange={(next) => setView(next as ThreadView)}
        className="ms-auto shrink-0 self-stretch"
      >
        <TabsList
          variant="underline"
          size="sm"
          className="h-full border-none py-0 *:data-[slot=tabs-tab]:hover:bg-transparent"
        >
          <TabsTab value="conversation">Conversation</TabsTab>
          <TabsTab value="highlights">Highlights</TabsTab>
        </TabsList>
      </Tabs>
      {actions}
    </header>
  )
}

/** The project this thread's context comes from, shown once a brief applies. */
export function ProjectContextChip() {
  // The thread it sits in, which may not be the route's (a docked or side thread).
  const threadId = useAuiState((s) => s.threadListItem.remoteId)
  const views = useOrganizedViews()
  const { data: organization } = useOrganization()
  const thread = threadId ? views.byId.get(threadId) : undefined
  const members = new Set(thread?.memberships.map((m) => m.projectId))
  const withBrief = organization?.projects.filter(
    (project) => project.brief && members.has(project.projectId),
  )
  const first = withBrief?.[0]
  if (!withBrief || !first) return null
  return (
    <p className="mb-4 flex min-h-10.5 items-center gap-2.5 rounded-lg bg-hover px-3 py-1.5 text-sm">
      <ProjectGlyph
        glyph={first.glyph}
        aria-hidden
        className="size-4 shrink-0 text-ink-muted"
      />
      <span className="min-w-0 truncate">
        {withBrief.map((project) => project.title).join(', ')}
      </span>
      <span aria-hidden className="h-4 w-px shrink-0 bg-separator" />
      <span className="shrink-0 text-ink-muted">Project context attached</span>
    </p>
  )
}
