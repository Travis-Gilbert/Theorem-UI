// SOURCING: date-fns (formatDistanceStrict, format); no relative-time rules of our own beyond the two cut-offs
//
// How recent something is, for lists. The full date and time belong in a
// details view (`fullTime`), not in the row.
import { format, formatDistanceStrict } from 'date-fns'

const MINUTE = 60_000
const WEEK = 7 * 24 * 60 * MINUTE

/** "Just now", "12 minutes ago", "3 days ago"; a calendar date from a week on. */
export function recency(ms: number, now = Date.now()): string {
  const age = now - ms
  if (age < 45_000) return 'Just now'
  if (age < WEEK) return formatDistanceStrict(ms, now, { addSuffix: true, roundingMethod: 'floor' })
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear()
  return format(ms, sameYear ? 'MMM d' : 'MMM d, yyyy')
}

/** The whole date and time, in the person's locale. */
export const fullTime = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
