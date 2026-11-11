// SOURCING: none — pure logic over the work contract's WorkFilter (field and operator vocabulary, the filter builder's chips to and from conditions, value labels from the facets); no upstream component models this contract
import { KIND_LABEL, PRIORITY_LABEL } from './grouping'
import type {
  WorkCondition,
  WorkFacets,
  WorkField,
  WorkFilter,
  WorkOperator,
  WorkPriority,
} from './contract'

export type FieldKind =
  | 'choice' // one of a known list of values
  | 'date'
  | 'text'
  | 'flag'

export type FieldSpec = {
  field: WorkField
  label: string
  kind: FieldKind
  /** Only some sources have it (a pull request's review state, checks). */
  optional?: boolean
}

/** The fields a filter can name, in the order the builder lists them. */
export const FIELDS: ReadonlyArray<FieldSpec> = [
  { field: 'status', label: 'Status', kind: 'choice' },
  { field: 'statusCategory', label: 'Status type', kind: 'choice' },
  { field: 'priority', label: 'Priority', kind: 'choice' },
  { field: 'assignee', label: 'Assignee', kind: 'choice' },
  { field: 'author', label: 'Creator', kind: 'choice' },
  { field: 'label', label: 'Label', kind: 'choice' },
  { field: 'project', label: 'Project', kind: 'choice' },
  { field: 'milestone', label: 'Milestone', kind: 'choice' },
  { field: 'kind', label: 'Type', kind: 'choice' },
  { field: 'repo', label: 'Repository', kind: 'choice', optional: true },
  { field: 'provider', label: 'Source', kind: 'choice' },
  { field: 'reviewDecision', label: 'Review', kind: 'choice', optional: true },
  { field: 'checks', label: 'Checks', kind: 'choice', optional: true },
  { field: 'draft', label: 'Draft', kind: 'flag', optional: true },
  { field: 'createdAt', label: 'Created', kind: 'date' },
  { field: 'updatedAt', label: 'Updated', kind: 'date' },
  { field: 'dueAt', label: 'Due date', kind: 'date' },
  { field: 'text', label: 'Text', kind: 'text' },
]

export const fieldSpec = (field: WorkField) =>
  FIELDS.find((f) => f.field === field)!

/** Fields whose absence is a value of its own ("no assignee"). */
const CAN_BE_EMPTY: ReadonlySet<WorkField> = new Set([
  'assignee',
  'label',
  'project',
  'milestone',
  'dueAt',
])

export function operatorsFor(field: WorkField): WorkOperator[] {
  const { kind } = fieldSpec(field)
  const empty: WorkOperator[] = CAN_BE_EMPTY.has(field)
    ? ['is_empty', 'is_not_empty']
    : []
  if (kind === 'choice') return ['is', 'is_not', 'in', 'not_in', ...empty]
  if (kind === 'date') return ['before', 'after', ...empty]
  if (kind === 'flag') return ['is']
  return ['contains']
}

export const OPERATOR_LABEL: Record<WorkOperator, string> = {
  is: 'is',
  is_not: 'is not',
  in: 'is any of',
  not_in: 'is none of',
  contains: 'contains',
  before: 'is before',
  after: 'is after',
  is_empty: 'is empty',
  is_not_empty: 'is set',
}

export const STATUS_CATEGORY_LABEL = {
  triage: 'Triage',
  backlog: 'Backlog',
  unstarted: 'Unstarted',
  started: 'Started',
  completed: 'Completed',
  canceled: 'Canceled',
} as const

const FIXED: Partial<Record<WorkField, { value: string; label: string }[]>> = {
  statusCategory: Object.entries(STATUS_CATEGORY_LABEL).map(
    ([value, label]) => ({ value, label }),
  ),
  priority: ([1, 2, 3, 4, 0] as WorkPriority[]).map((p) => ({
    value: String(p),
    label: PRIORITY_LABEL[p],
  })),
  kind: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })),
  provider: [
    { value: 'github', label: 'GitHub' },
    { value: 'local', label: 'Local' },
  ],
  reviewDecision: [
    { value: 'review_required', label: 'Review required' },
    { value: 'changes_requested', label: 'Changes requested' },
    { value: 'approved', label: 'Approved' },
  ],
  checks: [
    { value: 'pending', label: 'Pending' },
    { value: 'passing', label: 'Passing' },
    { value: 'failing', label: 'Failing' },
  ],
  draft: [
    { value: 'true', label: 'Draft' },
    { value: 'false', label: 'Ready for review' },
  ],
}

export type ValueOption = { value: string; label: string }

/** The values a choice field offers: fixed lists, or what the facets know. */
export function valueOptions(
  field: WorkField,
  facets: WorkFacets | undefined,
): ValueOption[] {
  const me = { value: 'me', label: 'Me' }
  const actor = (a: WorkFacets['assignees'][number]) => ({
    value: a.id,
    label: a.name ?? a.login ?? a.id,
  })
  switch (field) {
    case 'status':
      return (facets?.statuses ?? []).map((s) => ({
        value: s.id,
        label: s.name,
      }))
    case 'assignee':
    case 'author':
      return [me, ...(facets?.assignees ?? []).map(actor)]
    case 'label':
      return (facets?.labels ?? []).map((l) => ({ value: l.id, label: l.name }))
    case 'project':
      return (facets?.projects ?? []).map((p) => ({
        value: p.id,
        label: p.name,
      }))
    case 'milestone':
      return (facets?.milestones ?? []).map((m) => ({
        value: m.id,
        label: m.name,
      }))
    case 'repo':
      return (facets?.repos ?? []).map((r) => ({ value: r, label: r }))
    default:
      return FIXED[field] ?? []
  }
}

// Chips: the flat view of one condition the builder edits

export type FilterChip = {
  field: WorkField
  operator: WorkOperator
  values: string[]
}

const OPENING: Partial<Record<WorkOperator, WorkOperator>> = {
  is: 'is_not',
  is_not: 'is',
  in: 'not_in',
  not_in: 'in',
}

export const isNegated = (operator: WorkOperator) =>
  operator === 'is_not' || operator === 'not_in'

/** `is` or `in` (and their negations) by how many values there are. */
export function settle(operator: WorkOperator, count: number): WorkOperator {
  if (operator === 'is' || operator === 'in') return count > 1 ? 'in' : 'is'
  if (operator === 'is_not' || operator === 'not_in')
    return count > 1 ? 'not_in' : 'is_not'
  return operator
}

export const negate = (operator: WorkOperator) => OPENING[operator] ?? operator

export function chipOf(condition: WorkCondition): FilterChip {
  const { value } = condition
  return {
    field: condition.field,
    operator: condition.operator,
    values:
      value === undefined
        ? []
        : Array.isArray(value)
          ? value.map(String)
          : [String(value)],
  }
}

export function conditionOf(chip: FilterChip): WorkCondition {
  const { field, values } = chip
  const operator = settle(chip.operator, values.length)
  if (operator === 'is_empty' || operator === 'is_not_empty')
    return { field, operator }
  if (field === 'draft') return { field, operator, value: values[0] === 'true' }
  if (values.length > 1) return { field, operator, value: values }
  if (field === 'priority' && values[0] !== undefined)
    return { field, operator, value: Number(values[0]) }
  return { field, operator, value: values[0] ?? '' }
}

export const isCondition = (
  entry: WorkCondition | WorkFilter,
): entry is WorkCondition => 'field' in entry

/**
 * A choice condition with the same field and polarity absorbs the values of
 * one added to it. The other kinds stay conditions of their own: a date's
 * `before` and `after` are two bounds of one range, not two values of one
 * condition, and two text matches are two containments.
 */
export function addChip(filter: WorkFilter, chip: FilterChip): WorkFilter {
  const at =
    fieldSpec(chip.field).kind === 'choice'
      ? filter.conditions.findIndex(
          (c) =>
            isCondition(c) &&
            c.field === chip.field &&
            isNegated(c.operator) === isNegated(chip.operator) &&
            chip.values.length > 0 &&
            c.value !== undefined,
        )
      : -1
  if (at < 0)
    return { ...filter, conditions: [...filter.conditions, conditionOf(chip)] }
  const held = chipOf(filter.conditions[at] as WorkCondition)
  const merged = {
    ...held,
    values: [...new Set([...held.values, ...chip.values])],
  }
  return {
    ...filter,
    conditions: filter.conditions.with(at, conditionOf(merged)),
  }
}

export function replaceAt(
  filter: WorkFilter,
  index: number,
  entry: WorkCondition | WorkFilter,
): WorkFilter {
  return { ...filter, conditions: filter.conditions.with(index, entry) }
}

export function removeAt(filter: WorkFilter, index: number): WorkFilter {
  return {
    ...filter,
    conditions: filter.conditions.filter((_, i) => i !== index),
  }
}

/** The condition with its polarity flipped; ones with no opposite are as they were. */
export function flipAt(filter: WorkFilter, index: number): WorkFilter {
  const entry = filter.conditions[index]
  if (!entry || !isCondition(entry)) return filter
  const operator = negate(entry.operator)
  return operator === entry.operator
    ? filter
    : replaceAt(filter, index, { ...entry, operator })
}

export const isEmptyFilter = (filter: WorkFilter) =>
  filter.conditions.length === 0

/** Whether two filters say the same thing; `in` of one value is `is`. */
export function sameFilter(a: WorkFilter, b: WorkFilter): boolean {
  const norm = (f: WorkFilter): unknown => ({
    op: f.op,
    conditions: f.conditions.map((c) =>
      isCondition(c) ? conditionOf(chipOf(c)) : norm(c),
    ),
  })
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b))
}

/** What a chip's values read as: names from the facets, else the raw value. */
export function valueLabels(
  chip: FilterChip,
  facets: WorkFacets | undefined,
): string[] {
  if (fieldSpec(chip.field).kind !== 'choice') return chip.values
  const options = valueOptions(chip.field, facets)
  return chip.values.map(
    (v) => options.find((o) => o.value === v)?.label ?? v,
  )
}

/** One line for a chip: "Status is any of Todo, Doing". */
export function describeChip(
  chip: FilterChip,
  facets: WorkFacets | undefined,
): string {
  const { label } = fieldSpec(chip.field)
  const op = OPERATOR_LABEL[settle(chip.operator, chip.values.length)]
  const values = valueLabels(chip, facets).join(', ')
  return [label, op, values].filter(Boolean).join(' ')
}
