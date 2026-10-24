// SOURCING: date-fns (dates in a query's rows, written as a day when they are
// one) and last-run.ts's formatValue for everything else.
import { format, isValid, parseISO } from 'date-fns'
import { formatValue } from '@/lib/blocks/last-run'

const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * A row's value as a `yyyy-MM-dd` day, or null. CSV dates arrive as Dates at
 * midnight UTC (d3-dsv's autoType), mentions as day strings.
 */
export function dateOf(value: unknown): string | null {
  if (value instanceof Date && isValid(value))
    return value.toISOString().slice(0, 10)
  if (typeof value === 'string' && isValid(parseISO(value)))
    return DAY.test(value) ? value : format(parseISO(value), 'yyyy-MM-dd')
  return null
}

/** A value as a table cell shows it. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    if (!isValid(value)) return ''
    const day = value.toISOString().slice(0, 10)
    return value.toISOString().endsWith('T00:00:00.000Z')
      ? day
      : format(value, 'yyyy-MM-dd HH:mm')
  }
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  return formatValue(value)
}
