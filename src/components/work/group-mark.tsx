// SOURCING: none — the mark a group header or board column wears for the value it groups by (a status dot, priority bars, a person, a label), from the marks the rows already use
import { ActorAvatar, LabelChip, PriorityMark, StatusMark } from './marks'
import type { WorkFacets, WorkGroupBy, WorkPriority } from './contract'

/** The mark for one group of a grouping, when its value has one. */
export function GroupMark({
  groupBy,
  groupKey,
  facets,
}: {
  groupBy: NonNullable<WorkGroupBy>
  groupKey: string
  facets: WorkFacets | undefined
}) {
  switch (groupBy) {
    case 'status': {
      const status = facets?.statuses.find((s) => s.id === groupKey)
      return status ? <StatusMark status={status} /> : null
    }
    case 'priority':
      return <PriorityMark priority={Number(groupKey) as WorkPriority} />
    case 'assignee': {
      const actor = facets?.assignees.find((a) => a.id === groupKey)
      return actor ? <ActorAvatar actor={actor} /> : null
    }
    case 'label': {
      const label = facets?.labels.find((l) => l.id === groupKey)
      return label ? <LabelChip label={label} /> : null
    }
    default:
      return null
  }
}
