// SOURCING: none — pure logic over the work contract: what a quick edit offers for a field, what the chosen items already hold, and the patch a choice means
import { PRIORITIES, PRIORITY_LABEL } from './grouping'
import type {
  WorkFacets,
  WorkItem,
  WorkItemPatch,
  WorkPriority,
} from './contract'

/** The fields a quick edit changes, in the order the menus list them. */
export type EditField =
  | 'status'
  | 'priority'
  | 'assignee'
  | 'label'
  | 'project'
  | 'milestone'

export const EDIT_LABEL: Record<EditField, string> = {
  status: 'Status',
  priority: 'Priority',
  assignee: 'Assignee',
  label: 'Labels',
  project: 'Project',
  milestone: 'Milestone',
}

/** Assignees and labels hold several values; the rest hold one. */
export const isMultiple = (field: EditField) =>
  field === 'assignee' || field === 'label'

export const canClear = (field: EditField) =>
  field === 'project' || field === 'milestone'

export type Option = { value: string; label: string }

/** What a field offers to pick from. A milestone is offered within the project, when there is one. */
export function optionsFor(
  field: EditField,
  facets: WorkFacets | undefined,
  projectId?: string,
): Option[] {
  switch (field) {
    case 'status':
      return (facets?.statuses ?? []).map((s) => ({ value: s.id, label: s.name }))
    case 'priority':
      return PRIORITIES.map((p) => ({
        value: String(p),
        label: PRIORITY_LABEL[p],
      }))
    case 'assignee':
      return (facets?.assignees ?? []).map((a) => ({
        value: a.id,
        label: a.name ?? a.login ?? a.id,
      }))
    case 'label':
      return (facets?.labels ?? []).map((l) => ({ value: l.id, label: l.name }))
    case 'project':
      return (facets?.projects ?? []).map((p) => ({
        value: p.id,
        label: p.name,
      }))
    case 'milestone':
      return (facets?.milestones ?? [])
        .filter((m) => !projectId || m.projectId === projectId)
        .map((m) => ({ value: m.id, label: m.name }))
  }
}

/** The values one item holds for a field. */
export function heldBy(item: WorkItem, field: EditField): string[] {
  switch (field) {
    case 'status':
      return [item.status.id]
    case 'priority':
      return [String(item.priority)]
    case 'assignee':
      return item.assignees.map((a) => a.id)
    case 'label':
      return item.labels.map((l) => l.id)
    case 'project':
      return item.projectId ? [item.projectId] : []
    case 'milestone':
      return item.milestoneId ? [item.milestoneId] : []
  }
}

/** The values every one of `items` holds, which a picker shows as chosen. */
export function sharedBy(items: WorkItem[], field: EditField): string[] {
  const [first, ...rest] = items
  if (!first) return []
  return heldBy(first, field).filter((value) =>
    rest.every((item) => heldBy(item, field).includes(value)),
  )
}

/**
 * The patch for choosing `value` on one item. A single-valued field takes it
 * (`null` clears a project or milestone); a multi-valued one adds it, or
 * removes it when `add` is false.
 */
export function patchFor(
  field: EditField,
  item: WorkItem,
  value: string | null,
  add = true,
): WorkItemPatch | undefined {
  switch (field) {
    case 'status':
      return value ? { statusId: value } : undefined
    case 'priority':
      return value === null ? undefined : { priority: Number(value) as WorkPriority }
    case 'project':
      return { projectId: value }
    case 'milestone':
      return { milestoneId: value }
    case 'assignee':
    case 'label': {
      if (!value) return undefined
      const held = heldBy(item, field)
      const next = add
        ? held.includes(value)
          ? held
          : [...held, value]
        : held.filter((v) => v !== value)
      return field === 'assignee' ? { assignees: next } : { labels: next }
    }
  }
}

/**
 * Choosing a multi-valued option on several items: if every item has it the
 * choice removes it from all, else it adds it to all. One item toggles.
 */
export const addsOnToggle = (
  items: WorkItem[],
  field: EditField,
  value: string,
) => !sharedBy(items, field).includes(value)
