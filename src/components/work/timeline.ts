// SOURCING: none — pure logic over the work contract: the one line a timeline event says, from its type and its opaque from/to data
import { PRIORITY_LABEL } from './grouping'
import type { TimelineEvent, TimelineEventType } from './contract'

/** What an event's value reads as: a name for a thing, the names of several, a priority by its word. */
export function valueText(value: unknown, type?: TimelineEventType): string {
  if (value === null || value === undefined || value === '') return ''
  if (Array.isArray(value)) return value.map((v) => valueText(v, type)).filter(Boolean).join(', ')
  if (typeof value === 'number')
    return type === 'priority' && value in PRIORITY_LABEL
      ? PRIORITY_LABEL[value as keyof typeof PRIORITY_LABEL]
      : String(value)
  if (typeof value === 'string' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    const named = value as Record<string, unknown>
    for (const key of ['name', 'title', 'login', 'id']) {
      const found = named[key]
      if (typeof found === 'string') return found
    }
  }
  return ''
}

const NOUN: Partial<Record<TimelineEventType, string>> = {
  status: 'status',
  label: 'labels',
  assignee: 'assignees',
  priority: 'priority',
  milestone: 'milestone',
  project: 'project',
}

const field = (event: TimelineEvent, key: string) =>
  valueText(event.data?.[key], event.type)

/** One line for what happened, without the actor: "moved status from Todo to Done". */
export function describeEvent(event: TimelineEvent): string {
  const { type } = event
  const noun = NOUN[type]
  if (noun) {
    const from = field(event, 'from')
    const to = field(event, 'to')
    if (from && to) return `changed ${noun} from ${from} to ${to}`
    if (to) return `set ${noun} to ${to}`
    if (from) return `cleared ${noun} (was ${from})`
    return `changed ${noun}`
  }
  switch (type) {
    case 'created':
      return 'created this'
    case 'comment':
      return 'commented'
    case 'review': {
      const state = field(event, 'state')
      return state ? `reviewed: ${state.replace(/_/g, ' ').toLowerCase()}` : 'reviewed'
    }
    case 'commit': {
      const message = field(event, 'message')
      return message ? `pushed: ${message}` : 'pushed a commit'
    }
    case 'check': {
      const name = field(event, 'name')
      const result = field(event, 'conclusion') || field(event, 'state')
      return [name || 'a check', result].filter(Boolean).join(' ')
    }
    case 'reference': {
      const title = field(event, 'title') || field(event, 'key')
      return title ? `referenced this from ${title}` : 'referenced this'
    }
    default:
      return type
  }
}
