// SOURCING: Theorem's client operations (theorem-surface-contracts client_operation: a client declares operations in `clientOperations` beside `clientSurface` on its send, each becomes a tool of that turn, a call streams a `client_operation` part, and the client answers with a `client-operation-receipt` run command), the same protocol the web's Kit uses in Theorem-UI src/lib/kit/operations.ts
//
// One thing the phone can do that the agent cannot: put an event in front of
// the person in the system's own event editor (docs/plans/theo-iphone.md §3).
// The agent proposes; the person saves or does not. The receipt says only
// that the proposal was shown, because a run waits seconds for a receipt and a
// person takes longer than that to decide. What they decided reaches the
// agent in their next message.

export const PROPOSE_EVENT = 'phone.calendar.propose_event'

export const PHONE_OPERATIONS = [
  {
    name: PROPOSE_EVENT,
    effect: 'presentation' as const,
    description:
      "The person is using Theorem on their iPhone. Shows them a calendar event you propose, as a card in this conversation with an Add to Calendar button that opens the phone's own event editor, filled in. Nothing is added unless they save it there, and you cannot read their calendar. Use it when they ask for an event to be added, for example from a poster or invitation they photographed. Give `start` and `end` as local date and time without a zone (`2026-11-20T19:30`), read as the phone's time zone, or with an offset when the source states one; for an all-day event give dates (`2026-11-20`) and set `allDay`. Leave out anything the source does not state rather than guessing. The receipt says only that the card was shown. Whether they saved it is told to you in their next message.",
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'start'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        start: { type: 'string', maxLength: 40 },
        end: { type: 'string', maxLength: 40 },
        allDay: { type: 'boolean' },
        location: { type: 'string', maxLength: 300 },
        notes: { type: 'string', maxLength: 2000 },
      },
    },
  },
]

export type EventProposal = {
  title: string
  startDate: Date
  endDate: Date
  allDay: boolean
  location?: string
  notes?: string
}

export type Parsed = { ok: true; proposal: EventProposal } | { ok: false; reason: string }

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const HOUR_MS = 60 * 60_000

/** A date alone is that day in the phone's zone, not midnight UTC. */
function when(value: unknown, field: string): Date | string {
  if (typeof value !== 'string' || !value.trim()) return `${field}: a date or a date and time is required`
  const day = DATE_ONLY.exec(value.trim())
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value.trim())
  if (Number.isNaN(date.getTime())) return `${field}: "${value}" is not a date the phone can read`
  if (day && (date.getMonth() !== Number(day[2]) - 1 || date.getDate() !== Number(day[3])))
    return `${field}: "${value}" is not a real date`
  return date
}

const text = (value: unknown, field: string, max: number): string | undefined | { error: string } => {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') return { error: `${field}: must be text` }
  if (value.length > max) return { error: `${field}: longer than ${max} characters` }
  return value.trim() || undefined
}

/** Reads the agent's arguments by the declaration, or says what is wrong with them. */
export function parseProposal(args: unknown): Parsed {
  if (typeof args !== 'object' || args === null || Array.isArray(args))
    return { ok: false, reason: 'arguments must be an object' }
  const input = args as Record<string, unknown>
  const known = new Set(['title', 'start', 'end', 'allDay', 'location', 'notes'])
  const extra = Object.keys(input).find((key) => !known.has(key))
  if (extra) return { ok: false, reason: `${extra}: not an argument of ${PROPOSE_EVENT}` }

  const title = text(input.title, 'title', 200)
  if (typeof title === 'object') return { ok: false, reason: title.error }
  if (!title) return { ok: false, reason: 'title: required' }
  if (input.allDay !== undefined && typeof input.allDay !== 'boolean')
    return { ok: false, reason: 'allDay: must be true or false' }
  const allDay = input.allDay === true
  const startDate = when(input.start, 'start')
  if (typeof startDate === 'string') return { ok: false, reason: startDate }
  let endDate: Date
  if (input.end === undefined || input.end === null) {
    endDate = allDay ? startDate : new Date(startDate.getTime() + HOUR_MS)
  } else {
    const parsed = when(input.end, 'end')
    if (typeof parsed === 'string') return { ok: false, reason: parsed }
    endDate = parsed
  }
  if (endDate.getTime() < startDate.getTime()) return { ok: false, reason: 'end: is before start' }
  const location = text(input.location, 'location', 300)
  if (typeof location === 'object') return { ok: false, reason: location.error }
  const notes = text(input.notes, 'notes', 2000)
  if (typeof notes === 'object') return { ok: false, reason: notes.error }
  return { ok: true, proposal: { title, startDate, endDate, allDay, location, notes } }
}

export type Receipt = {
  outcome: 'applied' | 'rejected'
  reason?: string
  result?: unknown
  revision: number
}

let revision = 0

/** What a send carries so the turn can reach the phone. The revision counts the requests this app has answered. */
export const phoneTurnOptions = () => ({ clientOperations: PHONE_OPERATIONS, clientSurface: { revision } })

/** The answer to one request: shown, or refused with what was wrong. Never "saved". */
export function receiptFor(parsed: Parsed): Receipt {
  revision += 1
  if (!parsed.ok) return { outcome: 'rejected', reason: parsed.reason, revision }
  return {
    outcome: 'applied',
    result: {
      shown: true,
      saved: 'unknown',
      note: 'The person has been shown the event with an Add to Calendar button. It is not in their calendar unless they save it; they will say so in their next message.',
    },
    revision,
  }
}

export type EditorOutcome = 'saved' | 'canceled' | 'deleted' | 'done'

/** The line offered to the person's composer after the editor closes. Their words to send or change. */
export function outcomeLine(outcome: EditorOutcome, proposal: EventProposal): string | undefined {
  if (outcome === 'saved') return `I saved “${proposal.title}” to my calendar.`
  if (outcome === 'canceled') return `I did not add “${proposal.title}” to my calendar.`
  return undefined
}

/** What the card says once the editor has closed. `done` is Android's answer, which does not say which. */
export function outcomeWords(outcome: EditorOutcome): string {
  switch (outcome) {
    case 'saved':
      return 'Saved to your calendar.'
    case 'canceled':
      return 'Not added. You closed the editor without saving.'
    case 'deleted':
      return 'The event was deleted in the editor.'
    default:
      return 'The editor closed. The phone was not told whether the event was saved.'
  }
}

export function whenWords(proposal: EventProposal, locale?: string): string {
  const day: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
  const time: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
  const sameDay = proposal.startDate.toDateString() === proposal.endDate.toDateString()
  const start = proposal.startDate.toLocaleDateString(locale, day)
  if (proposal.allDay)
    return sameDay
      ? `${start}, all day`
      : `${start} to ${proposal.endDate.toLocaleDateString(locale, day)}, all day`
  const from = proposal.startDate.toLocaleTimeString(locale, time)
  const to = proposal.endDate.toLocaleTimeString(locale, time)
  return sameDay
    ? `${start}, ${from} to ${to}`
    : `${start}, ${from} to ${proposal.endDate.toLocaleDateString(locale, day)}, ${to}`
}
