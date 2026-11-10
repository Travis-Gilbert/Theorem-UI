// SOURCING: TanStack Table v9 through the app's kit hook (sortable columns, the kit's Table and DateCell) for the projects list; coss ui Badge. The progress bar and the status breakdown are hand-rolled: a project's progress is the tracker's own measure (completed and started over total), which no chart library models
import { parseISO } from 'date-fns'
import { useMemo } from 'react'
import { Badge } from '@/components/coss/badge'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/coss/empty'
import {
  createAppColumnHelper,
  useAppTable,
} from '@/components/data-table/table-hook'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/data-table/ui/table'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import { STATUS_CATEGORY_LABEL } from './filter'
import { WorkItems } from './items-screen'
import { ActorAvatar, RelativeTime, actorName } from './marks'
import { useWorkProject, useWorkProjects } from './queries'
import { describeEvent } from './timeline'
import { useViewState } from './view-state'
import { WorkViewBar } from './view-bar'
import type {
  WorkFilter,
  WorkProgress,
  WorkProject as Project,
  WorkProjectStatus,
} from './contract'

const ALL_ROWS = { pageIndex: 0, pageSize: Number.MAX_SAFE_INTEGER }

const STATUS: Record<
  WorkProjectStatus,
  { label: string; variant: 'outline' | 'info' | 'warning' | 'success' | 'secondary' }
> = {
  planned: { label: 'Planned', variant: 'outline' },
  active: { label: 'Active', variant: 'info' },
  paused: { label: 'Paused', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  canceled: { label: 'Canceled', variant: 'secondary' },
}

const CATEGORY_FILL: Record<string, string> = {
  triage: 'bg-redwood',
  backlog: 'bg-ink-faint/40',
  unstarted: 'bg-ink-muted/50',
  started: 'bg-ochre',
  completed: 'bg-teal',
  canceled: 'bg-ink-faint/25',
}

const categoryLabel = (category: string) =>
  (STATUS_CATEGORY_LABEL as Record<string, string>)[category] ?? category

const percent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0

/** Completed over total, with what is under way as the lighter stretch after it. */
export function ProgressBar({
  progress,
  className,
}: {
  progress: WorkProgress
  className?: string
}) {
  const done = percent(progress.completed, progress.total)
  const started = percent(progress.started, progress.total)
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={done}
        aria-label="Progress"
        className="flex h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-pill"
      >
        <span className="bg-teal" style={{ width: `${done}%` }} />
        <span className="bg-ochre/60" style={{ width: `${started}%` }} />
      </div>
      <span className="w-9 shrink-0 text-end text-xs text-ink-muted tabular-nums">
        {done}%
      </span>
    </div>
  )
}

const columnHelper = createAppColumnHelper<Project>()

const columns = columnHelper.columns([
  columnHelper.accessor('name', {
    id: 'name',
    header: ({ header }) => <header.ColumnHeader />,
    cell: ({ row }) => (
      <span className="truncate font-medium">{row.original.name}</span>
    ),
    sortFn: 'alphanumeric',
    size: 280,
    meta: { label: 'Name', variant: 'text' },
  }),
  columnHelper.accessor('status', {
    id: 'status',
    header: ({ header }) => <header.ColumnHeader />,
    cell: ({ row }) => (
      <Badge variant={STATUS[row.original.status].variant}>
        {STATUS[row.original.status].label}
      </Badge>
    ),
    size: 110,
    meta: { label: 'Status', variant: 'select' },
  }),
  columnHelper.accessor((row) => (row.lead ? actorName(row.lead) : undefined), {
    id: 'lead',
    header: ({ header }) => <header.ColumnHeader />,
    cell: ({ row }) =>
      row.original.lead ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <ActorAvatar actor={row.original.lead} />
          <span className="truncate">{actorName(row.original.lead)}</span>
        </span>
      ) : (
        <span className="text-ink-faint">No lead</span>
      ),
    sortFn: 'alphanumeric',
    sortUndefined: 'last',
    size: 150,
    meta: { label: 'Lead', variant: 'text' },
  }),
  columnHelper.accessor(
    (row) => (row.targetDate ? parseISO(row.targetDate) : undefined),
    {
      id: 'targetDate',
      header: ({ header }) => <header.ColumnHeader />,
      cell: ({ cell }) => <cell.DateCell />,
      sortFn: 'datetime',
      sortUndefined: 'last',
      size: 110,
      meta: { label: 'Target', variant: 'date' },
    },
  ),
  columnHelper.accessor(
    (row) => percent(row.progress.completed, row.progress.total),
    {
      id: 'progress',
      header: ({ header }) => <header.ColumnHeader />,
      cell: ({ row }) => <ProgressBar progress={row.original.progress} />,
      sortFn: 'basic',
      size: 180,
      meta: { label: 'Progress', variant: 'number' },
    },
  ),
  columnHelper.accessor((row) => parseISO(row.updatedAt), {
    id: 'updatedAt',
    header: ({ header }) => <header.ColumnHeader />,
    cell: ({ row }) => (
      <RelativeTime iso={row.original.updatedAt} className="text-ink-muted" />
    ),
    sortFn: 'datetime',
    size: 90,
    meta: { label: 'Updated', variant: 'date' },
  }),
])

function ListBody({
  projects,
  selectedId,
  onOpen,
}: {
  projects: Project[]
  selectedId?: string
  onOpen?: (projectId: string) => void
}) {
  const table = useAppTable({
    columns,
    data: projects,
    getRowId: (project) => project.id,
    initialState: {
      sorting: [{ id: 'updatedAt', desc: true }],
      pagination: ALL_ROWS,
    },
    autoResetPageIndex: false,
  })
  return (
    <table.AppTable>
      <Table
        containerClassName="min-h-0 flex-1 overflow-auto"
        style={{ width: table.getTotalSize(), minWidth: '100%' }}
      >
        <TableHeader className="sticky top-0 z-10 bg-raised [&_tr]:border-separator">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => (
                <table.AppHeader header={header} key={header.id}>
                  {(h) => (
                    <TableHead
                      colSpan={h.colSpan}
                      className="h-9"
                      style={{ flexGrow: h.getSize(), width: h.getSize() }}
                    >
                      {h.isPlaceholder ? null : <h.FlexRender />}
                    </TableHead>
                  )}
                </table.AppHeader>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              tabIndex={0}
              aria-label={row.original.name}
              data-state={row.original.id === selectedId ? 'selected' : undefined}
              onClick={() => onOpen?.(row.original.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onOpen?.(row.original.id)
              }}
              className="cursor-default border-separator outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
            >
              {row.getVisibleCells().map((cell) => (
                <table.AppCell cell={cell} key={cell.id}>
                  {(c) => (
                    <TableCell
                      className="py-2 text-sm text-ink"
                      style={{
                        flexGrow: c.column.getSize(),
                        width: c.column.getSize(),
                      }}
                    >
                      <c.FlexRender />
                    </TableCell>
                  )}
                </table.AppCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </table.AppTable>
  )
}

/** Every project with its status, lead, target, progress and last change; choosing one calls `onOpen`. */
export function WorkProjects({
  selectedId,
  onOpen,
}: {
  selectedId?: string
  onOpen?: (projectId: string) => void
}) {
  const projects = useWorkProjects()
  if (projects.isPending)
    return (
      <div className="flex flex-col gap-px p-2" aria-busy>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-md" />
        ))}
      </div>
    )
  if (projects.isError)
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm">
        <span className="text-error-ink">{describeError(projects.error)}</span>
        <Button size="sm" variant="outline" onClick={() => void projects.refetch()}>
          Try again
        </Button>
      </div>
    )
  if (!projects.data.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No projects yet</EmptyTitle>
          <EmptyDescription>
            Projects appear here as the connected repositories bring them in.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ListBody projects={projects.data} selectedId={selectedId} onOpen={onOpen} />
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function ProjectItems({
  projectId,
  selectedId,
  onOpen,
}: {
  projectId: string
  selectedId?: string
  onOpen?: (itemId: string) => void
}) {
  const extra = useMemo<WorkFilter>(
    () => ({
      op: 'and',
      conditions: [{ field: 'project', operator: 'is', value: projectId }],
    }),
    [projectId],
  )
  const state = useViewState('all-issues', extra)
  return (
    <div className="flex h-[32rem] min-h-0 flex-col border-t border-separator">
      <WorkViewBar state={state} />
      <WorkItems state={state} selectedId={selectedId} onOpen={onOpen} />
    </div>
  )
}

/**
 * One project: where it stands (progress, milestones, status breakdown), what
 * happened lately, and its items as a list or board.
 */
export function WorkProject({
  projectId,
  selectedItemId,
  onOpenItem,
}: {
  projectId: string
  selectedItemId?: string
  onOpenItem?: (itemId: string) => void
}) {
  const detail = useWorkProject(projectId)
  if (detail.isPending)
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy>
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  if (detail.isError)
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm">
        <span className="text-error-ink">{describeError(detail.error)}</span>
        <Button size="sm" variant="outline" onClick={() => void detail.refetch()}>
          Try again
        </Button>
      </div>
    )

  const { project, statusCounts, recent } = detail.data
  const total = statusCounts.reduce((sum, s) => sum + s.count, 0)
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex flex-col gap-2 px-4 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Icon.Project className="size-4 text-ink-faint" />
          <h2 className="font-heading text-lg font-medium">{project.name}</h2>
          <Badge variant={STATUS[project.status].variant}>
            {STATUS[project.status].label}
          </Badge>
          {project.source.repo && (
            <span className="text-sm text-ink-faint">{project.source.repo}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
          {project.lead && (
            <span className="inline-flex items-center gap-1.5">
              <ActorAvatar actor={project.lead} />
              {actorName(project.lead)}
            </span>
          )}
          {project.targetDate && (
            <span className="inline-flex items-center gap-1.5">
              <Icon.Calendar className="size-3.5" />
              Target {parseISO(project.targetDate).toLocaleDateString()}
            </span>
          )}
        </div>
        {project.description && (
          <p className="max-w-prose text-sm text-ink-muted">{project.description}</p>
        )}
      </header>

      <div className="grid gap-6 px-4 py-4 @3xl:grid-cols-2">
        <Section title="Progress">
          <ProgressBar progress={project.progress} />
          <p className="text-xs text-ink-muted tabular-nums">
            {project.progress.completed} of {project.progress.total} done,{' '}
            {project.progress.started} in progress
          </p>
          {total > 0 && (
            <>
              <div
                role="img"
                aria-label="Items by status"
                className="flex h-2 overflow-hidden rounded-full bg-pill"
              >
                {statusCounts.map((s) => (
                  <span
                    key={s.category}
                    className={CATEGORY_FILL[s.category] ?? 'bg-ink-faint/30'}
                    style={{ width: `${percent(s.count, total)}%` }}
                  />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                {statusCounts.map((s) => (
                  <li key={s.category} className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        CATEGORY_FILL[s.category] ?? 'bg-ink-faint/30',
                      )}
                    />
                    {categoryLabel(s.category)}
                    <span className="tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>

        <Section title="Milestones">
          {project.milestones.length ? (
            <ul className="flex flex-col gap-2">
              {project.milestones.map((m) => (
                <li key={m.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    {m.state === 'closed' && <Badge variant="success">Closed</Badge>}
                    {m.targetDate && (
                      <span className="text-xs text-ink-faint tabular-nums">
                        {parseISO(m.targetDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <ProgressBar progress={m.progress} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-faint">No milestones.</p>
          )}
        </Section>

        <Section title="Recent activity">
          {recent.length ? (
            <ul className="flex flex-col gap-1.5">
              {recent.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    disabled={!onOpenItem}
                    onClick={() => onOpenItem?.(event.itemId)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-start text-xs text-ink-muted hover:bg-hover"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-ink">
                        {event.actor ? actorName(event.actor) : 'Someone'}
                      </span>{' '}
                      {describeEvent(event)}
                    </span>
                    <RelativeTime iso={event.createdAt} className="shrink-0 text-ink-faint" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-faint">Nothing has happened lately.</p>
          )}
        </Section>
      </div>

      <ProjectItems
        projectId={projectId}
        selectedId={selectedItemId}
        onOpen={onOpenItem}
      />
    </div>
  )
}
