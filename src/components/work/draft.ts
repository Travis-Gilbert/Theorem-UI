// SOURCING: zustand (the view bar's unsaved changes to a view, shared by the bar, the list and the board that show the same view; browser-session only, like the shell's other transient state)
import { create } from 'zustand'
import { isEmptyFilter, sameFilter } from './filter'
import type {
  WorkFilter,
  WorkOrderBy,
  WorkQuery,
  WorkView,
} from './contract'

/** The parts of a view the view bar edits. */
export type WorkDraft = Pick<
  WorkView,
  'layout' | 'filter' | 'groupBy' | 'orderBy' | 'displayFields'
>

/** What a row or card can show, in the order the display menu lists them. */
export const DISPLAY_FIELDS = [
  { id: 'key', label: 'Key' },
  { id: 'priority', label: 'Priority' },
  { id: 'labels', label: 'Labels' },
  { id: 'pullRequest', label: 'Pull request' },
  { id: 'project', label: 'Project' },
  { id: 'milestone', label: 'Milestone' },
  { id: 'repo', label: 'Repository' },
  { id: 'assignees', label: 'Assignees' },
  { id: 'dueAt', label: 'Due date' },
  { id: 'updatedAt', label: 'Updated' },
] as const
export type DisplayField = (typeof DISPLAY_FIELDS)[number]['id']

export const DEFAULT_DISPLAY_FIELDS: DisplayField[] = [
  'key',
  'priority',
  'labels',
  'pullRequest',
  'project',
  'assignees',
  'updatedAt',
]

export const DEFAULT_ORDER: WorkOrderBy = {
  field: 'updatedAt',
  direction: 'desc',
}

export const draftOf = (view: WorkView): WorkDraft => ({
  layout: view.layout,
  filter: view.filter,
  groupBy: view.groupBy,
  orderBy: view.orderBy,
  displayFields: view.displayFields,
})

/** The view with the unsaved changes applied. */
export const withDraft = (
  view: WorkView,
  change: Partial<WorkDraft> | undefined,
): WorkView => (change ? { ...view, ...change } : view)

/** Whether the changes say anything the saved view does not. */
export function isDirty(
  view: WorkView,
  change: Partial<WorkDraft> | undefined,
): boolean {
  if (!change) return false
  const next = withDraft(view, change)
  return (
    next.layout !== view.layout ||
    next.groupBy !== view.groupBy ||
    next.orderBy.field !== view.orderBy.field ||
    next.orderBy.direction !== view.orderBy.direction ||
    !sameFilter(next.filter, view.filter) ||
    next.displayFields.join() !== view.displayFields.join()
  )
}

/** The fields a row shows: the view's own, else the defaults, ignoring ids this build does not know. */
export function shownFields(displayFields: string[]): ReadonlySet<DisplayField> {
  const known = new Set<string>(DISPLAY_FIELDS.map((f) => f.id))
  const own = displayFields.filter((id) => known.has(id))
  return new Set((own.length ? own : DEFAULT_DISPLAY_FIELDS) as DisplayField[])
}

/** `filter` narrowed by `extra`, as one filter. */
export function narrow(filter: WorkFilter, extra?: WorkFilter): WorkFilter {
  if (!extra || isEmptyFilter(extra)) return filter
  if (isEmptyFilter(filter)) return extra
  return { op: 'and', conditions: [filter, extra] }
}

/** The query a draft asks the source, narrowed by a filter the placement adds. */
export function queryOf(
  draft: Pick<WorkDraft, 'filter' | 'groupBy' | 'orderBy'>,
  extra?: WorkFilter,
): Omit<WorkQuery, 'cursor'> {
  return {
    filter: narrow(draft.filter, extra),
    groupBy: draft.groupBy,
    orderBy: draft.orderBy,
  }
}

type Drafts = {
  /** Unsaved changes by view id. */
  changes: Record<string, Partial<WorkDraft>>
  edit: (viewId: string, change: Partial<WorkDraft>) => void
  reset: (viewId: string) => void
}

export const useWorkDrafts = create<Drafts>()((set) => ({
  changes: {},
  edit: (viewId, change) =>
    set((s) => ({
      changes: {
        ...s.changes,
        [viewId]: { ...s.changes[viewId], ...change },
      },
    })),
  reset: (viewId) =>
    set((s) => {
      const { [viewId]: _gone, ...rest } = s.changes
      return { changes: rest }
    }),
}))
