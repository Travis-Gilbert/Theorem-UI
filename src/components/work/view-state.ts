// SOURCING: zustand (./draft) and @tanstack/react-query (./queries): one hook gives the bar, the list and the board the same view, its unsaved changes and the query they mean
import { useId, useMemo } from 'react'
import { DEFAULT_ORDER, isDirty, queryOf, useWorkDrafts, withDraft } from './draft'
import type { WorkDraft } from './draft'
import { EMPTY_FILTER } from './contract'
import type { WorkFilter, WorkView } from './contract'
import { useWorkViews } from './queries'

/** What a list shows when it is placed with no saved view behind it. */
const ADHOC: WorkView = {
  id: '',
  name: 'Items',
  scope: 'items',
  layout: 'list',
  filter: EMPTY_FILTER,
  groupBy: null,
  orderBy: DEFAULT_ORDER,
  displayFields: [],
  builtin: true,
  revision: '',
}

/**
 * The view a bar, list or board shows: the saved one (or a blank one when no
 * view is named) with this page's unsaved changes on it, and the query that
 * means. `extra` narrows the query further without becoming part of the view,
 * which is how a template scopes a list to GitHub or to one project.
 */
export function useViewState(viewId: string | undefined, extra?: WorkFilter) {
  const views = useWorkViews()
  const adhoc = useId()
  const key = viewId ?? `adhoc:${adhoc}`
  const change = useWorkDrafts((s) => s.changes[key])
  const edit = useWorkDrafts((s) => s.edit)
  const reset = useWorkDrafts((s) => s.reset)
  const saved = viewId ? views.data?.find((v) => v.id === viewId) : undefined
  const base = viewId ? saved : ADHOC
  const view = useMemo(
    () => (base ? withDraft(base, change) : undefined),
    [base, change],
  )
  const query = useMemo(
    () => (view ? queryOf(view, extra) : undefined),
    [view, extra],
  )
  return {
    /** The view as saved; absent for a blank one or while views load. */
    saved,
    /** The view with unsaved changes applied. */
    view,
    query,
    dirty: base && viewId ? isDirty(base, change) : false,
    /** Views are still loading, or the id names none. */
    loading: !!viewId && views.isPending,
    missing: !!viewId && views.isSuccess && !saved,
    edit: (next: Partial<WorkDraft>) => edit(key, next),
    reset: () => reset(key),
  }
}

export type ViewState = ReturnType<typeof useViewState>
