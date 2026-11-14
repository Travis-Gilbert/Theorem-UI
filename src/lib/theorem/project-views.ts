// SOURCING: none: the project home's tabs and the graph's lenses as URL search values (docs/plans/projects-sidebar-and-session-graph.md §7 and §9.1).
import { LENSES } from './session-graph'
import type { GraphLens } from './session-graph'

export const PROJECT_VIEWS = [
  'overview',
  'sessions',
  'graph',
  'context',
] as const
export type ProjectView = (typeof PROJECT_VIEWS)[number]

/** A project home's search: unknown values fall back to the defaults. */
export function projectSearch(search: Record<string, unknown>): {
  view?: ProjectView
  lens?: GraphLens
} {
  return {
    view: PROJECT_VIEWS.find((v) => v === search.view),
    lens: LENSES.find((l) => l.id === search.lens)?.id,
  }
}
