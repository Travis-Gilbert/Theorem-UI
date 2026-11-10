// SOURCING: date-fns for the due date; the marks (./marks) and quick-edit buttons (./pickers) the rows of the list and the cards of the board both draw, so a field looks and edits the same in either
import { format, isPast, parseISO } from 'date-fns'
import type { ReactNode } from 'react'
import { Icon } from '@/components/icons'
import { cn } from '@/lib/utils'
import {
  ActorStack,
  LabelChip,
  PriorityMark,
  PullRequestBadges,
  RelativeTime,
  StatusMark,
} from './marks'
import { PickerButton } from './pickers'
import { useWorkFacets } from './queries'
import type { DisplayField } from './draft'
import type { WorkItem } from './contract'

export function StatusField({ item }: { item: WorkItem }) {
  return (
    <PickerButton field="status" item={item} className="px-1">
      <StatusMark status={item.status} />
    </PickerButton>
  )
}

export function PriorityField({ item }: { item: WorkItem }) {
  return (
    <PickerButton field="priority" item={item} className="px-1">
      <PriorityMark priority={item.priority} />
    </PickerButton>
  )
}

export function LabelsField({ item, max = 3 }: { item: WorkItem; max?: number }) {
  if (!item.labels.length) return null
  return (
    <PickerButton field="label" item={item} className="min-w-0">
      {item.labels.slice(0, max).map((label) => (
        <LabelChip key={label.id} label={label} />
      ))}
      {item.labels.length > max && (
        <span className="text-[11px] text-ink-faint">
          +{item.labels.length - max}
        </span>
      )}
    </PickerButton>
  )
}

export function PullRequestField({ item }: { item: WorkItem }) {
  return item.pullRequest ? <PullRequestBadges pr={item.pullRequest} /> : null
}

export function ProjectField({ item }: { item: WorkItem }) {
  const projects = useWorkFacets().data?.projects
  const name = projects?.find((p) => p.id === item.projectId)?.name
  if (!item.projectId) return null
  return (
    <PickerButton field="project" item={item} className="max-w-36">
      <Icon.Project className="size-3 shrink-0 text-ink-faint" />
      <span className="truncate text-xs text-ink-muted">{name ?? 'Project'}</span>
    </PickerButton>
  )
}

export function MilestoneField({ item }: { item: WorkItem }) {
  const milestones = useWorkFacets().data?.milestones
  const name = milestones?.find((m) => m.id === item.milestoneId)?.name
  if (!item.milestoneId) return null
  return (
    <PickerButton field="milestone" item={item} className="max-w-32">
      <span className="truncate text-xs text-ink-muted">{name ?? 'Milestone'}</span>
    </PickerButton>
  )
}

export function RepoField({ item }: { item: WorkItem }) {
  return item.source.repo ? (
    <span className="max-w-40 truncate text-xs text-ink-faint">
      {item.source.repo}
    </span>
  ) : null
}

export function AssigneesField({ item }: { item: WorkItem }) {
  return (
    <PickerButton field="assignee" item={item}>
      {item.assignees.length ? (
        <ActorStack actors={item.assignees} />
      ) : (
        <span
          aria-label="Unassigned"
          className="grid size-5 place-items-center rounded-full border border-dashed border-separator text-ink-faint"
        >
          <Icon.Add className="size-3" />
        </span>
      )}
    </PickerButton>
  )
}

export function DueField({ item }: { item: WorkItem }) {
  if (!item.dueAt) return null
  const due = parseISO(item.dueAt)
  const open =
    item.status.category !== 'completed' && item.status.category !== 'canceled'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs tabular-nums',
        open && isPast(due) ? 'text-redwood' : 'text-ink-muted',
      )}
    >
      <Icon.Calendar className="size-3" />
      {format(due, 'MMM d')}
    </span>
  )
}

export function UpdatedField({ item }: { item: WorkItem }) {
  return (
    <RelativeTime iso={item.updatedAt} className="text-xs text-ink-faint" />
  )
}

/** `theorem/web#108` reads `web#108` in a row; the whole key is the tooltip and the repo has its own field. */
export const shortKey = (key: string) => key.slice(key.lastIndexOf('/') + 1)

export function KeyField({ item }: { item: WorkItem }) {
  return (
    <span
      title={item.key}
      className="shrink-0 truncate text-xs tabular-nums text-ink-faint"
    >
      {shortKey(item.key)}
    </span>
  )
}

/** The optional fields of an item by the display-field id a view lists. */
export const FIELD: Record<
  Exclude<DisplayField, 'priority' | 'key'>,
  (props: { item: WorkItem }) => ReactNode
> = {
  labels: LabelsField,
  pullRequest: PullRequestField,
  project: ProjectField,
  milestone: MilestoneField,
  repo: RepoField,
  assignees: AssigneesField,
  dueAt: DueField,
  updatedAt: UpdatedField,
}
