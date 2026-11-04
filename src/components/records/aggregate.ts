// SOURCING: none — the record table footer's per-column calculations (Twenty's "Calculate" menu: counts and percentages for every field, sum/min/max/average for numbers, earliest/latest for dates, checked/unchecked for booleans), pure over the loaded values
import type { FieldKind } from './contract'
import { isEmptyValue } from './model'

export type AggregateOp =
  | 'count'
  | 'empty'
  | 'notEmpty'
  | 'unique'
  | 'percentEmpty'
  | 'percentNotEmpty'
  | 'sum'
  | 'min'
  | 'max'
  | 'average'
  | 'earliest'
  | 'latest'
  | 'checked'
  | 'unchecked'

/** The footer reads "<label> <value>", as Twenty's does. */
export const AGGREGATE_LABEL: Record<AggregateOp, string> = {
  count: 'Count all',
  empty: 'Empty',
  notEmpty: 'Not empty',
  unique: 'Unique',
  percentEmpty: 'Percent empty',
  percentNotEmpty: 'Percent not empty',
  sum: 'Sum',
  min: 'Min',
  max: 'Max',
  average: 'Average',
  earliest: 'Earliest',
  latest: 'Latest',
  checked: 'Checked',
  unchecked: 'Unchecked',
}

const COUNTS: AggregateOp[] = [
  'count',
  'empty',
  'notEmpty',
  'unique',
  'percentEmpty',
  'percentNotEmpty',
]

/** What a column of this kind can be calculated as, counts first. */
export function aggregateOptions(kind: FieldKind): AggregateOp[] {
  switch (kind) {
    case 'integer':
    case 'number':
      return [...COUNTS, 'sum', 'min', 'max', 'average']
    case 'date':
    case 'timestamp':
      return [...COUNTS, 'earliest', 'latest']
    case 'boolean':
      return ['count', 'checked', 'unchecked', 'percentEmpty']
    default:
      return COUNTS
  }
}

const numbers = (values: unknown[]) =>
  values.flatMap((v) => {
    const n =
      typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) && !(typeof v === 'string' && !v.trim())
      ? [n]
      : []
  })

const times = (values: unknown[]) =>
  values.flatMap((v) => {
    if (typeof v !== 'string' && typeof v !== 'number') return []
    const t = new Date(v).getTime()
    return Number.isNaN(t) ? [] : [t]
  })

const uniqueKey = (value: unknown) =>
  typeof value === 'object' ? JSON.stringify(value) : String(value)

/**
 * The calculation over a column's values. Percentages are 0 to 100; dates
 * come back as epoch milliseconds; nothing to calculate is null.
 */
export function computeAggregate(
  op: AggregateOp,
  values: unknown[],
): number | null {
  const filled = values.filter((v) => !isEmptyValue(v))
  switch (op) {
    case 'count':
      return values.length
    case 'empty':
      return values.length - filled.length
    case 'notEmpty':
      return filled.length
    case 'unique':
      return new Set(filled.map(uniqueKey)).size
    case 'percentEmpty':
      return values.length
        ? ((values.length - filled.length) / values.length) * 100
        : null
    case 'percentNotEmpty':
      return values.length ? (filled.length / values.length) * 100 : null
    case 'checked':
      return values.filter((v) => v === true).length
    case 'unchecked':
      return values.filter((v) => v !== true).length
  }
  if (op === 'earliest' || op === 'latest') {
    const ts = times(filled)
    if (!ts.length) return null
    return op === 'earliest' ? Math.min(...ts) : Math.max(...ts)
  }
  const ns = numbers(filled)
  if (!ns.length) return null
  switch (op) {
    case 'sum':
      return ns.reduce((a, b) => a + b, 0)
    case 'min':
      return Math.min(...ns)
    case 'max':
      return Math.max(...ns)
    case 'average':
      return ns.reduce((a, b) => a + b, 0) / ns.length
  }
  return null
}

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export function formatAggregate(op: AggregateOp, value: number | null) {
  if (value === null) return '—'
  if (op === 'percentEmpty' || op === 'percentNotEmpty')
    return `${Math.round(value)}%`
  if (op === 'earliest' || op === 'latest') return DATE.format(value)
  return NUMBER.format(value)
}
