// SOURCING: none — wire types copied from the work-items contract (docs/plans/work-items/CONTRACT.md, section A); no upstream component applies
//
// The shapes of /api/work/v1, plus the small request and page shapes the
// WorkSource interface needs. Nothing here is GitHub-specific except the
// optional fields the contract itself marks as such (pullRequest, repo).

export type WorkStatusCategory =
  | 'triage'
  | 'backlog'
  | 'unstarted'
  | 'started'
  | 'completed'
  | 'canceled'

export type WorkStatus = {
  id: string
  name: string
  category: WorkStatusCategory
}

export type WorkActor = {
  id: string
  login?: string
  name?: string
  avatarUrl?: string
  isMe?: boolean
}

export type WorkLabel = { id: string; name: string; color?: string }

/** 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
export type WorkPriority = 0 | 1 | 2 | 3 | 4

export type WorkItemKind = 'issue' | 'pull_request' | 'task'

export type WorkProvider = 'github' | 'local'

export type ReviewDecision = 'approved' | 'changes_requested' | 'review_required'
export type ChecksState = 'pending' | 'passing' | 'failing'

export type WorkPullRequest = {
  draft: boolean
  merged: boolean
  reviewDecision?: ReviewDecision
  checks?: ChecksState
  baseRef?: string
  headRef?: string
  additions?: number
  deletions?: number
}

export type WorkItem = {
  id: string
  kind: WorkItemKind
  key: string
  title: string
  bodyMarkdown?: string
  url?: string
  source: {
    provider: WorkProvider
    repo?: string
    number?: number
    nodeId?: string
  }
  status: WorkStatus
  priority: WorkPriority
  labels: WorkLabel[]
  assignees: WorkActor[]
  author?: WorkActor
  projectId?: string
  milestoneId?: string
  parentId?: string
  createdAt: string
  updatedAt: string
  closedAt?: string
  dueAt?: string
  commentCount: number
  pullRequest?: WorkPullRequest
  /** Opaque; sent as If-Match on PATCH. */
  revision: string
}

export type WorkProgress = { total: number; completed: number; started: number }

export type WorkMilestone = {
  id: string
  name: string
  targetDate?: string
  state: 'open' | 'closed'
  progress: WorkProgress
}

export type WorkProjectStatus =
  | 'planned'
  | 'active'
  | 'paused'
  | 'completed'
  | 'canceled'

export type WorkProject = {
  id: string
  name: string
  description?: string
  url?: string
  source: { provider: WorkProvider; repo?: string }
  status: WorkProjectStatus
  lead?: WorkActor
  targetDate?: string
  progress: WorkProgress
  milestones: WorkMilestone[]
  updatedAt: string
  revision: string
}

export type WorkField =
  | 'status'
  | 'statusCategory'
  | 'priority'
  | 'assignee'
  | 'author'
  | 'label'
  | 'project'
  | 'milestone'
  | 'kind'
  | 'repo'
  | 'provider'
  | 'createdAt'
  | 'updatedAt'
  | 'dueAt'
  | 'checks'
  | 'reviewDecision'
  | 'draft'
  | 'text'

export type WorkOperator =
  | 'is'
  | 'is_not'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'before'
  | 'after'
  | 'is_empty'
  | 'is_not_empty'

export type WorkCondition = {
  field: WorkField
  operator: WorkOperator
  /** "me" is accepted for assignee and author. */
  value?: string | number | boolean | string[]
}

export type WorkFilter = {
  op: 'and' | 'or'
  conditions: (WorkCondition | WorkFilter)[]
}

export type WorkGroupBy =
  | 'status'
  | 'priority'
  | 'assignee'
  | 'project'
  | 'milestone'
  | 'label'
  | 'repo'
  | 'kind'
  | null

export type WorkOrderField =
  | 'updatedAt'
  | 'createdAt'
  | 'priority'
  | 'dueAt'
  | 'title'
  | 'status'

export type WorkOrderBy = { field: WorkOrderField; direction: 'asc' | 'desc' }

export type WorkViewScope = 'items' | 'inbox' | 'projects'

export type WorkView = {
  id: string
  name: string
  icon?: string
  scope: WorkViewScope
  layout: 'list' | 'board'
  filter: WorkFilter
  groupBy: WorkGroupBy
  orderBy: WorkOrderBy
  /** Which item fields a row or card shows. */
  displayFields: string[]
  /** Shipped views cannot be deleted, can be copied. */
  builtin: boolean
  revision: string
}

export type InboxReason =
  | 'assigned'
  | 'review_requested'
  | 'mentioned'
  | 'comment'
  | 'status_changed'
  | 'check_failed'
  | 'subscribed'
  | 'investigation'

export type InboxEntry = {
  id: string
  itemId: string
  reason: InboxReason
  actor?: WorkActor
  summary: string
  createdAt: string
  readAt?: string
  snoozedUntil?: string
  archivedAt?: string
  item: Pick<
    WorkItem,
    'id' | 'kind' | 'key' | 'title' | 'status' | 'priority' | 'source' | 'url'
  >
}

export type InboxState = 'unread' | 'all' | 'snoozed' | 'archived'
export type InboxAction = 'read' | 'unread' | 'snooze' | 'archive' | 'unarchive'
export type InboxBulkAction = 'read_all' | 'archive_read'

export type TimelineEventType =
  | 'created'
  | 'comment'
  | 'status'
  | 'label'
  | 'assignee'
  | 'priority'
  | 'review'
  | 'commit'
  | 'check'
  | 'reference'
  | 'milestone'
  | 'project'

export type TimelineEvent = {
  id: string
  itemId: string
  type: TimelineEventType
  actor?: WorkActor
  createdAt: string
  bodyMarkdown?: string
  /** From and to values for a change. */
  data?: Record<string, unknown>
}

export type SyncState = {
  state: 'idle' | 'running' | 'error'
  lastSyncedAt?: string
  detail?: string
}

export type WorkConsequence = {
  id:
    | 'push_refreshes_context'
    | 'review_request_creates_inbox_entry'
    | 'failed_workflow_starts_investigation'
    | 'issue_comment_joins_task'
  enabled: boolean
}

export type WorkSettings = {
  /** The whole tracker; off hides it in the UI. */
  enabled: boolean
  github: { enabled: boolean; repos: string[] }
  consequences: WorkConsequence[]
  sync: SyncState
  revision: string
}

// Requests and pages

export type WorkQuery = {
  filter?: WorkFilter
  groupBy?: WorkGroupBy
  orderBy?: WorkOrderBy
  cursor?: string
  limit?: number
}

export type WorkGroup = { key: string; label: string; count: number }

export type WorkItemsPage = {
  items: WorkItem[]
  groups?: WorkGroup[]
  nextCursor?: string
  total: number
}

export type WorkItemDetail = { item: WorkItem; timeline: TimelineEvent[] }

export type WorkProjectDetail = {
  project: WorkProject
  statusCounts: { category: string; count: number }[]
  recent: TimelineEvent[]
}

export type WorkItemPatch = Partial<{
  title: string
  bodyMarkdown: string
  statusId: string
  priority: WorkPriority
  assignees: string[]
  labels: string[]
  projectId: string | null
  milestoneId: string | null
  dueAt: string | null
}>

export type NewWorkItem = {
  title: string
  bodyMarkdown?: string
  kind?: WorkItemKind
  statusId?: string
  priority?: WorkPriority
  projectId?: string
  labels?: string[]
  assignees?: string[]
  target?: { provider: 'github'; repo: string }
}

export type InboxPage = {
  entries: InboxEntry[]
  nextCursor?: string
  unreadCount: number
}

export type WorkFacets = {
  statuses: WorkStatus[]
  labels: WorkLabel[]
  assignees: WorkActor[]
  projects: { id: string; name: string }[]
  milestones: { id: string; name: string; projectId: string }[]
  repos: string[]
}

export type WorkEvent =
  | { type: 'work.item.upserted'; item: WorkItem }
  | { type: 'work.item.deleted'; id: string }
  | { type: 'work.inbox.upserted'; entry: InboxEntry; unreadCount: number }
  | { type: 'work.project.upserted'; project: WorkProject }
  | { type: 'work.sync'; sync: SyncState }

export const WORK_EVENT_TYPES: ReadonlyArray<WorkEvent['type']> = [
  'work.item.upserted',
  'work.item.deleted',
  'work.inbox.upserted',
  'work.project.upserted',
  'work.sync',
]

/** The built-in view ids the contract ships. */
export const BUILTIN_VIEW_IDS = [
  'inbox',
  'my-issues',
  'active',
  'high-priority',
  'review-requests',
  'all-issues',
  'board',
] as const

export const EMPTY_FILTER: WorkFilter = { op: 'and', conditions: [] }
