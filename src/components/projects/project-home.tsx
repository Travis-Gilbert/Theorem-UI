// SOURCING: coss ui tabs over Base UI, the chat Composer (as the compare pane carries it away from the conversation: the runtime's new thread is filed in the project the shell names), @tanstack/react-router search for the tab and the lens, date-fns for how long ago, lucide-react marks for the context kinds Theorem does not serve yet, lib/theorem/organization and components/shell/projects for the records, lib/theorem/session-graph for the graph. The layout (a header, a composer, recent sessions, and the project's instructions and knowledge beside them) follows Claude's project page on Mobbin; docs/plans/projects-sidebar-and-session-graph.md §7.
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { formatDistanceToNowStrict } from 'date-fns'
import { Database, FileText, FolderGit2, Link2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Composer } from '@/components/chat/composer'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/coss/tabs'
import { Icon } from '@/components/icons'
import { ProjectGlyph, SessionGlyph } from '@/components/organize/glyphs'
import { ProjectStateDialog } from '@/components/organize/project-state-dialog'
import { useProjects } from '@/components/shell/projects'
import { useShell } from '@/components/shell/shell-state'
import { Button } from '@/components/ui/button'
import { lastMoved, useOrganization } from '@/lib/theorem/organization'
import type { ThreadEntry } from '@/lib/theorem/organization'
import { PROJECT_VIEWS } from '@/lib/theorem/project-views'
import type { ProjectView } from '@/lib/theorem/project-views'
import { projectGraph } from '@/lib/theorem/session-graph'
import type { GraphLens } from '@/lib/theorem/session-graph'
import {
  allTypes,
  isPinned,
  typeOf,
  useSidebarPrefs,
} from '@/lib/theorem/sidebar-prefs'
import { cn } from '@/lib/utils'
import { ProjectEditDialog } from './project-edit-dialog'
import { ProjectOutputs } from './project-outputs'
import { SessionGraphView } from './session-graph'

const VIEW_LABEL: Readonly<Record<ProjectView, string>> = {
  overview: 'Overview',
  sessions: 'Sessions',
  graph: 'Graph',
  context: 'Context',
}

const RECENT = 6

const ago = (atMs: number) =>
  Date.now() - atMs < 60_000
    ? 'just now'
    : `${formatDistanceToNowStrict(atMs)} ago`

function Section({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <div className="flex min-h-7 items-center gap-2">
        <h2 data-appearance-recipe="ui.group" className="flex-1 text-ink">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** A session in a list: its mark, its name, where it came from, when it last moved. */
function SessionLine({
  thread,
  titles,
}: {
  thread: ThreadEntry
  titles: ReadonlyMap<string, string>
}) {
  const origin = thread.origin
  const source = origin && titles.get(origin.threadId)
  return (
    <li>
      <Link
        to="/c/$threadId"
        params={{ threadId: thread.threadId }}
        className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-1.5 hover:bg-hover"
      >
        <SessionGlyph threadId={thread.threadId} className="text-ink-muted" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span data-appearance-recipe="ui.label" className="truncate">
            {thread.title || 'New chat'}
          </span>
          {(thread.summary || source) && (
            <span className="truncate text-xs text-ink-muted">
              {source
                ? `${origin.kind === 'forked' ? 'Forked from' : 'Continues'} ${source}`
                : thread.summary?.text}
            </span>
          )}
        </span>
        {thread.attention.running && (
          <span className="text-xs text-ink-muted">Running</span>
        )}
        <span className="shrink-0 text-xs text-ink-muted tabular-nums">
          {ago(lastMoved(thread))}
        </span>
      </Link>
    </li>
  )
}

/** Context Theorem does not serve per project yet, said plainly instead of drawn as empty controls. */
const NOT_SERVED = [
  {
    Mark: FileText,
    label: 'Documents',
    detail: 'Files and notes attached to the project for every session.',
  },
  {
    Mark: FolderGit2,
    label: 'Repositories',
    detail: 'Code the project works in.',
  },
  {
    Mark: Link2,
    label: 'Links',
    detail: 'Pages and references kept with the project.',
  },
  {
    Mark: Database,
    label: 'Databases and servers',
    detail: 'Connections sessions here may use.',
  },
] as const

function NotServedList() {
  return (
    <ul className="flex flex-col divide-y divide-separator rounded-xl ring-1 ring-separator">
      {NOT_SERVED.map(({ Mark, label, detail }) => (
        <li key={label} className="flex items-start gap-3 px-4 py-3">
          <Mark
            aria-hidden
            strokeWidth={1.75}
            className="mt-0.5 size-4 shrink-0 text-ink-muted"
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span data-appearance-recipe="ui.label">{label}</span>
            <span className="text-xs text-ink-muted">{detail}</span>
          </span>
          <span className="shrink-0 text-xs text-ink-muted">
            Not served yet
          </span>
        </li>
      ))}
    </ul>
  )
}

/** On a project's home, the title that stands where the open thread's would: in the phone header and the dock's tab. */
export function useProjectHomeTitle() {
  const { threadId, projectId } = useParams({ strict: false })
  const { data } = useOrganization()
  if (threadId !== undefined || projectId === undefined) return undefined
  return (
    data?.projects.find((p) => p.projectId === projectId)?.title ?? 'Project'
  )
}

/**
 * A project's home: what it is, a composer that starts a session in it, its
 * sessions, a graph of how they relate, and the context its sessions share.
 */
export function ProjectHome({ projectId }: { projectId: string }) {
  const { data: organization, isPending } = useOrganization()
  const { data: records = [] } = useProjects()
  const search = useSearch({ from: '/_chat/projects/$projectId' })
  const navigate = useNavigate()
  const view = search.view ?? 'overview'
  const lens = search.lens ?? 'lineage'
  const [editing, setEditing] = useState(false)
  const [editingState, setEditingState] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string>()
  const pin = { kind: 'project', id: projectId } as const
  const pinned = useSidebarPrefs((s) => isPinned(s.pins, pin))
  const togglePin = useSidebarPrefs((s) => s.togglePin)
  const chosen = useSidebarPrefs((s) => s.sessionTypes)
  const custom = useSidebarPrefs((s) => s.customTypes)

  // The composer files its new session in the project the shell names.
  useEffect(() => {
    useShell.getState().setProjectId(projectId)
  }, [projectId])

  const project = organization?.projects.find((p) => p.projectId === projectId)
  const record = records.find((p) => p.projectId === projectId)
  const threads = useMemo(
    () =>
      (organization?.threads ?? [])
        .filter((t) => t.memberships.some((m) => m.projectId === projectId))
        .sort((a, b) => lastMoved(b) - lastMoved(a)),
    [organization, projectId],
  )
  const titles = useMemo(
    () =>
      new Map(
        (organization?.threads ?? []).map((t) => [
          t.threadId,
          t.title || 'New chat',
        ]),
      ),
    [organization],
  )
  const graph = useMemo(
    () =>
      projectGraph(
        lens,
        organization?.threads ?? [],
        organization?.projects ?? [],
        projectId,
      ),
    [lens, organization, projectId],
  )

  const show = (next: { view?: ProjectView; lens?: GraphLens }) =>
    void navigate({
      to: '/projects/$projectId',
      params: { projectId },
      search: { ...search, ...next },
      replace: true,
    })

  if (isPending)
    return <div className="p-10 text-sm text-ink-muted">Loading project…</div>
  if (!project)
    return (
      <div className="flex flex-col gap-2 p-10">
        <p data-appearance-recipe="ui.group">There is no such project</p>
        <p className="text-sm text-ink-muted">
          It may have been archived, or it belongs to another workspace.
        </p>
      </div>
    )

  const instructions = record?.instructions ?? ''
  const types = allTypes(custom)
  const typesHere = types.filter((type) =>
    threads.some((t) => typeOf(t.threadId, chosen, custom).id === type.id),
  )
  const listed = typeFilter
    ? threads.filter(
        (t) => typeOf(t.threadId, chosen, custom).id === typeFilter,
      )
    : threads

  const instructionsCard = (
    <Section
      title="Instructions"
      action={
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
      }
    >
      {instructions.trim() ? (
        <p className="line-clamp-6 text-sm whitespace-pre-wrap text-ink">
          {instructions}
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          None yet. Instructions are given to every session started here.
        </p>
      )}
    </Section>
  )
  const standsCard = organization?.served && (
    <Section
      title="Where it stands"
      action={
        <Button variant="ghost" size="sm" onClick={() => setEditingState(true)}>
          Edit
        </Button>
      }
    >
      {project.state ? (
        <>
          <p className="text-sm whitespace-pre-wrap text-ink">
            {project.state.text}
          </p>
          <p className="text-xs text-ink-muted">
            {project.state.by === 'librarian' ? 'The Librarian' : 'You'},{' '}
            {ago(project.state.atMs)}
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-muted">Not written yet.</p>
      )}
    </Section>
  )

  return (
    <div className="h-full overflow-y-auto">
      <div
        className={cn(
          'mx-auto flex w-full flex-col gap-6 px-4 py-8 sm:px-8',
          view === 'graph' ? 'max-w-6xl' : 'max-w-5xl',
        )}
      >
        <header className="flex flex-wrap items-start gap-3">
          <ProjectGlyph aria-hidden className="mt-1 size-6 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1
              data-appearance-recipe="heading.medium"
              className="truncate text-ink"
            >
              {project.title}
            </h1>
            <p className="text-sm text-ink-muted">
              {threads.length} {threads.length === 1 ? 'session' : 'sessions'}
              {threads[0] ? ` · last moved ${ago(lastMoved(threads[0]))}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={pinned}
              onClick={() => togglePin(pin)}
            >
              {pinned ? (
                <Icon.Unpin className="size-4" />
              ) : (
                <Icon.Pin className="size-4" />
              )}
              {pinned ? 'Unpin' : 'Pin'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Icon.Edit className="size-4" />
              Edit
            </Button>
          </div>
        </header>

        <Tabs
          value={view}
          onValueChange={(next) => show({ view: next as ProjectView })}
          className="gap-6"
        >
          <TabsList
            variant="underline"
            className="w-full justify-start border-b border-separator"
          >
            {PROJECT_VIEWS.map((v) => (
              <TabsTab key={v} value={v} className="grow-0 px-3">
                {VIEW_LABEL[v]}
              </TabsTab>
            ))}
          </TabsList>

          <TabsPanel value="overview">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="flex min-w-0 flex-col gap-8">
                {/* The face perches on the composer's top edge, so the space above it stays clear. */}
                <section
                  aria-label={`Start a session in ${project.title}`}
                  className="pt-6"
                >
                  <Composer autoFocus={false} />
                </section>
                <Section
                  title="Recent sessions"
                  action={
                    threads.length > RECENT && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => show({ view: 'sessions' })}
                      >
                        All {threads.length}
                      </Button>
                    )
                  }
                >
                  {threads.length ? (
                    <ul className="-mx-3 flex flex-col">
                      {threads.slice(0, RECENT).map((t) => (
                        <SessionLine
                          key={t.threadId}
                          thread={t}
                          titles={titles}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-muted">
                      No sessions yet. Start one above.
                    </p>
                  )}
                </Section>
              </div>
              <aside className="flex flex-col gap-8">
                {instructionsCard}
                {standsCard}
                {organization?.served && (
                  <Section title="Apps and outputs">
                    <ProjectOutputs projectId={projectId} limit={5} />
                  </Section>
                )}
              </aside>
            </div>
          </TabsPanel>

          <TabsPanel value="sessions">
            <div className="flex flex-col gap-4">
              {typesHere.length > 1 && (
                <div
                  role="radiogroup"
                  aria-label="Session type"
                  className="flex flex-wrap gap-1"
                >
                  {[{ id: undefined, label: 'All' }, ...typesHere].map(
                    (type) => (
                      <button
                        key={type.id ?? 'all'}
                        type="button"
                        role="radio"
                        aria-checked={typeFilter === type.id}
                        onClick={() => setTypeFilter(type.id)}
                        className={cn(
                          'rounded-full px-3 py-1 text-sm text-ink-muted ring-1 ring-separator hover:text-ink',
                          typeFilter === type.id &&
                            'bg-selected text-ink ring-focus',
                        )}
                      >
                        {type.label}
                      </button>
                    ),
                  )}
                </div>
              )}
              {listed.length ? (
                <ul className="-mx-3 flex flex-col">
                  {listed.map((t) => (
                    <SessionLine key={t.threadId} thread={t} titles={titles} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">No sessions here.</p>
              )}
            </div>
          </TabsPanel>

          <TabsPanel value="graph" className="h-[min(70dvh,44rem)]">
            <SessionGraphView
              graph={graph}
              lens={lens}
              onLens={(next) => show({ lens: next })}
            />
          </TabsPanel>

          <TabsPanel value="context">
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="flex flex-col gap-8">
                {instructionsCard}
                {standsCard}
              </div>
              <div className="flex flex-col gap-8">
                {organization?.served && (
                  <Section title="Apps and outputs">
                    <ProjectOutputs projectId={projectId} />
                  </Section>
                )}
                <Section title="Knowledge and connections">
                  <NotServedList />
                </Section>
              </div>
            </div>
          </TabsPanel>
        </Tabs>
      </div>
      <ProjectEditDialog
        projectId={projectId}
        title={project.title}
        instructions={instructions}
        open={editing}
        onOpenChange={setEditing}
      />
      {organization?.served && (
        <ProjectStateDialog
          project={project}
          open={editingState}
          onOpenChange={setEditingState}
        />
      )}
    </div>
  )
}
