// SOURCING: none — test data shaped by the work contract (items, facets, inbox entries, a fake WorkSource); imported by the tests beside it and by nothing that ships
import type {
  InboxEntry,
  WorkFacets,
  WorkItem,
  WorkProject,
  WorkSettings,
  WorkStatus,
  WorkView,
  WorkViewScope,
} from './contract'
import type { WorkSource } from './source'

export const TODO: WorkStatus = { id: 'todo', name: 'Todo', category: 'unstarted' }
export const DOING: WorkStatus = { id: 'doing', name: 'In Progress', category: 'started' }
export const DONE: WorkStatus = { id: 'done', name: 'Done', category: 'completed' }

export const FACETS: WorkFacets = {
  statuses: [TODO, DOING, DONE],
  labels: [
    { id: 'bug', name: 'bug', color: '#d33' },
    { id: 'docs', name: 'docs' },
  ],
  assignees: [
    { id: 'ada', login: 'ada', name: 'Ada Lovelace' },
    { id: 'lin', login: 'lin' },
  ],
  projects: [{ id: 'p1', name: 'Launch' }],
  milestones: [{ id: 'm1', name: 'Beta', projectId: 'p1' }],
  repos: ['acme/api', 'acme/web'],
}

export function item(id: string, overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id,
    kind: 'issue',
    key: `acme/api#${id}`,
    title: `Item ${id}`,
    source: { provider: 'github', repo: 'acme/api', number: Number(id) || 1 },
    status: TODO,
    priority: 3,
    labels: [],
    assignees: [],
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-02T10:00:00Z',
    commentCount: 0,
    revision: 'r1',
    ...overrides,
  }
}

export function entry(
  id: string,
  overrides: Partial<InboxEntry> = {},
): InboxEntry {
  const subject = item('7')
  return {
    id,
    itemId: subject.id,
    reason: 'review_requested',
    summary: 'Ada asked for your review',
    createdAt: '2026-11-02T09:00:00Z',
    item: {
      id: subject.id,
      kind: subject.kind,
      key: subject.key,
      title: subject.title,
      status: subject.status,
      priority: subject.priority,
      source: subject.source,
    },
    ...overrides,
  }
}

export function project(id: string): WorkProject {
  return {
    id,
    name: `Project ${id}`,
    source: { provider: 'local' },
    status: 'active',
    progress: { total: 4, completed: 1, started: 1 },
    milestones: [],
    updatedAt: '2026-11-02T10:00:00Z',
    revision: 'p1',
  }
}

export function view(
  id: string,
  name: string,
  overrides: Partial<WorkView> = {},
  scope: WorkViewScope = 'items',
): WorkView {
  return {
    id,
    name,
    scope,
    layout: 'list',
    filter: { op: 'and', conditions: [] },
    groupBy: null,
    orderBy: { field: 'updatedAt', direction: 'desc' },
    displayFields: [],
    builtin: true,
    revision: 'v1',
    ...overrides,
  }
}

export const SETTINGS: WorkSettings = {
  enabled: true,
  github: { enabled: true, repos: ['acme/api'] },
  consequences: [{ id: 'push_refreshes_context', enabled: true }],
  sync: { state: 'idle' },
  revision: 's1',
}

/** A source that answers from what it is given and records what it was asked. */
export function fakeSource(
  overrides: Partial<WorkSource> = {},
  id = 'fake',
): WorkSource {
  return {
    id,
    queryItems: async () => ({ items: [], total: 0 }),
    getItem: async (itemId) => ({ item: item(itemId), timeline: [] }),
    listProjects: async () => [],
    getProject: async (projectId) => ({
      project: project(projectId),
      statusCounts: [],
      recent: [],
    }),
    listViews: async () => [],
    facets: async () => FACETS,
    subscribe: () => () => undefined,
    ...overrides,
  }
}
