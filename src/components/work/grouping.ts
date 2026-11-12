// SOURCING: none — pure logic over the work contract (grouping, ordering labels, board columns and the patch a card drop means); no upstream component applies
import type {
  NewWorkItem,
  WorkFacets,
  WorkGroup,
  WorkGroupBy,
  WorkItem,
  WorkItemPatch,
  WorkOrderBy,
  WorkOrderField,
  WorkPriority,
} from './contract'

/** The group (and board column) of items with no value for the grouped field. */
export const NO_GROUP = 'none'

export const PRIORITY_LABEL: Record<WorkPriority, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
}

export const PRIORITIES: ReadonlyArray<WorkPriority> = [1, 2, 3, 4, 0]

export const KIND_LABEL = {
  issue: 'Issue',
  pull_request: 'Pull request',
  task: 'Task',
} as const

export const GROUP_LABEL: Record<NonNullable<WorkGroupBy>, string> = {
  status: 'Status',
  priority: 'Priority',
  assignee: 'Assignee',
  project: 'Project',
  milestone: 'Milestone',
  label: 'Label',
  repo: 'Repository',
  kind: 'Type',
}

export const ORDER_LABEL: Record<WorkOrderField, string> = {
  updatedAt: 'Updated',
  createdAt: 'Created',
  priority: 'Priority',
  dueAt: 'Due date',
  title: 'Title',
  status: 'Status',
}

/** The groups an item sits in; an item with several labels or assignees sits in each. */
export function groupKeysOf(
  item: WorkItem,
  groupBy: NonNullable<WorkGroupBy>,
): string[] {
  switch (groupBy) {
    case 'status':
      return [item.status.id]
    case 'priority':
      return [String(item.priority)]
    case 'assignee':
      return item.assignees.length
        ? item.assignees.map((a) => a.id)
        : [NO_GROUP]
    case 'project':
      return [item.projectId ?? NO_GROUP]
    case 'milestone':
      return [item.milestoneId ?? NO_GROUP]
    case 'label':
      return item.labels.length ? item.labels.map((l) => l.id) : [NO_GROUP]
    case 'repo':
      return [item.source.repo ?? NO_GROUP]
    case 'kind':
      return [item.kind]
  }
}

/** The name a group shows when the server's own list does not name it. */
function labelFromItem(
  item: WorkItem,
  groupBy: NonNullable<WorkGroupBy>,
  key: string,
): string {
  if (key === NO_GROUP) return `No ${GROUP_LABEL[groupBy].toLowerCase()}`
  switch (groupBy) {
    case 'status':
      return item.status.name
    case 'priority':
      return PRIORITY_LABEL[item.priority]
    case 'assignee': {
      const actor = item.assignees.find((a) => a.id === key)
      return actor?.name ?? actor?.login ?? key
    }
    case 'label':
      return item.labels.find((l) => l.id === key)?.name ?? key
    case 'kind':
      return KIND_LABEL[item.kind]
    default:
      return key
  }
}

export type ItemGroup = {
  key: string
  label: string
  /** The server's count when it gave one, else the items loaded. */
  count: number
  items: WorkItem[]
}

/**
 * Items under their groups. The server's list says which groups exist, their
 * order and their full counts; items that fall in a group it did not name
 * still show, after the named ones.
 */
export function groupItems(
  items: WorkItem[],
  groupBy: NonNullable<WorkGroupBy>,
  named: WorkGroup[] = [],
): ItemGroup[] {
  const groups = new Map<string, ItemGroup>(
    named.map((g) => [g.key, { ...g, items: [] }]),
  )
  for (const item of items)
    for (const key of groupKeysOf(item, groupBy)) {
      let group = groups.get(key)
      if (!group) {
        group = {
          key,
          label: labelFromItem(item, groupBy, key),
          count: 0,
          items: [],
        }
        groups.set(key, group)
      }
      group.items.push(item)
    }
  return [...groups.values()].map((g) => ({
    ...g,
    count: Math.max(g.count, g.items.length),
  }))
}

/**
 * The columns of a board: every value the facets know, so an empty column is
 * still a place to drop, then any group the server named that they did not.
 */
export function boardColumns(
  groupBy: NonNullable<WorkGroupBy>,
  facets: WorkFacets | undefined,
  named: WorkGroup[] = [],
): WorkGroup[] {
  const count = new Map(named.map((g) => [g.key, g.count]))
  const known: WorkGroup[] = []
  const add = (key: string, label: string) =>
    known.push({ key, label, count: count.get(key) ?? 0 })
  const none = () => add(NO_GROUP, `No ${GROUP_LABEL[groupBy].toLowerCase()}`)
  switch (groupBy) {
    case 'status':
      facets?.statuses.forEach((s) => add(s.id, s.name))
      break
    case 'priority':
      PRIORITIES.forEach((p) => add(String(p), PRIORITY_LABEL[p]))
      break
    case 'assignee':
      facets?.assignees.forEach((a) => add(a.id, a.name ?? a.login ?? a.id))
      none()
      break
    case 'project':
      facets?.projects.forEach((p) => add(p.id, p.name))
      none()
      break
    case 'milestone':
      facets?.milestones.forEach((m) => add(m.id, m.name))
      none()
      break
    case 'label':
      facets?.labels.forEach((l) => add(l.id, l.name))
      none()
      break
    case 'repo':
      facets?.repos.forEach((r) => add(r, r))
      break
    case 'kind':
      for (const kind of ['issue', 'pull_request', 'task'] as const)
        add(kind, KIND_LABEL[kind])
      break
  }
  const seen = new Set(known.map((g) => g.key))
  return [...known, ...named.filter((g) => !seen.has(g.key))]
}

export type ListRow =
  | { type: 'group'; group: ItemGroup }
  | { type: 'item'; item: WorkItem; groupKey: string }

/** The flat rows a virtualized list draws: a header, then its items unless collapsed. */
export function flattenGroups(
  groups: ItemGroup[],
  collapsed: ReadonlySet<string>,
): ListRow[] {
  return groups.flatMap((group): ListRow[] => [
    { type: 'group', group },
    ...(collapsed.has(group.key)
      ? []
      : group.items.map(
          (item): ListRow => ({ type: 'item', item, groupKey: group.key }),
        )),
  ])
}

/** `direction` flipped, for a header that toggles. */
export const toggleDirection = (order: WorkOrderBy): WorkOrderBy => ({
  ...order,
  direction: order.direction === 'asc' ? 'desc' : 'asc',
})

export const describeOrder = (order: WorkOrderBy) =>
  `${ORDER_LABEL[order.field]} ${order.direction === 'asc' ? 'ascending' : 'descending'}`

/** The groupings a card can be dragged across: the ones that are a field the item can be edited by. */
export const DROPPABLE: ReadonlySet<WorkGroupBy> = new Set([
  'status',
  'priority',
  'assignee',
  'label',
  'project',
  'milestone',
])

/**
 * What dropping a card from one board column on another changes. A single
 * value field is set; a many-valued one (labels, assignees) swaps the value
 * of the column it left for the column it landed in. Fields the item cannot
 * be edited by (repository, type) have no patch.
 */
export function dropPatch(
  groupBy: WorkGroupBy,
  item: WorkItem,
  from: string,
  to: string,
): WorkItemPatch | undefined {
  if (from === to) return undefined
  const swap = (ids: string[]) => [
    ...new Set([...ids.filter((id) => id !== from), ...(to === NO_GROUP ? [] : [to])]),
  ]
  switch (groupBy) {
    case 'status':
      return { statusId: to }
    case 'priority':
      return { priority: Number(to) as WorkPriority }
    case 'assignee':
      return { assignees: swap(item.assignees.map((a) => a.id)) }
    case 'label':
      return { labels: swap(item.labels.map((l) => l.id)) }
    case 'project':
      return { projectId: to === NO_GROUP ? null : to }
    case 'milestone':
      return { milestoneId: to === NO_GROUP ? null : to }
    default:
      return undefined
  }
}

/** What a new item starts with when it is made from a group's own "+". */
export function defaultsFor(
  groupBy: WorkGroupBy,
  key: string,
): Partial<NewWorkItem> {
  if (key === NO_GROUP) return {}
  switch (groupBy) {
    case 'status':
      return { statusId: key }
    case 'priority':
      return { priority: Number(key) as WorkPriority }
    case 'project':
      return { projectId: key }
    case 'label':
      return { labels: [key] }
    case 'assignee':
      return { assignees: [key] }
    case 'kind':
      return key === 'task' ? { kind: 'task' } : {}
    default:
      return {}
  }
}
