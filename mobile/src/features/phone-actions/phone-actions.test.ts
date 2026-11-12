// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import {
  outcomeLine,
  outcomeWords,
  parseProposal,
  PHONE_OPERATIONS,
  phoneTurnOptions,
  PROPOSE_EVENT,
  receiptFor,
  whenWords,
} from './calendar'

describe('a proposed calendar event', () => {
  test('a local date and time is read in the phone’s zone and ends an hour later by default', () => {
    const parsed = parseProposal({ title: ' Open studio ', start: '2026-11-20T19:30', location: 'Hall 2' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.proposal.title).toBe('Open studio')
    expect(parsed.proposal.startDate.getHours()).toBe(19)
    expect(parsed.proposal.startDate.getMinutes()).toBe(30)
    expect(parsed.proposal.endDate.getTime() - parsed.proposal.startDate.getTime()).toBe(3_600_000)
    expect(parsed.proposal.location).toBe('Hall 2')
    expect(parsed.proposal.notes).toBeUndefined()
  })

  test('a date alone is that day here, not the day before in a western zone', () => {
    const parsed = parseProposal({ title: 'Fair', start: '2026-11-20', allDay: true })
    if (!parsed.ok) throw new Error(parsed.reason)
    expect(parsed.proposal.startDate.getDate()).toBe(20)
    expect(parsed.proposal.startDate.getMonth()).toBe(10)
    expect(parsed.proposal.endDate.getTime()).toBe(parsed.proposal.startDate.getTime())
    expect(whenWords(parsed.proposal, 'en-US')).toContain('all day')
  })

  test('what is wrong is named, and nothing is guessed', () => {
    const reason = (args: unknown) => {
      const parsed = parseProposal(args)
      return parsed.ok ? 'ok' : parsed.reason
    }
    expect(reason({ start: '2026-11-20' })).toBe('title: required')
    expect(reason({ title: 'x' })).toContain('start:')
    expect(reason({ title: 'x', start: 'next Friday' })).toContain('not a date')
    expect(reason({ title: 'x', start: '2026-02-31' })).toContain('not a real date')
    expect(reason({ title: 'x', start: '2026-11-20T19:00', end: '2026-11-20T18:00' })).toBe('end: is before start')
    expect(reason({ title: 'x', start: '2026-11-20', attendees: [] })).toContain('attendees')
    expect(reason('2026-11-20')).toBe('arguments must be an object')
  })

  test('the receipt says shown, never saved, and a bad proposal is rejected with its reason', () => {
    const before = phoneTurnOptions().clientSurface.revision
    const shown = receiptFor(parseProposal({ title: 'x', start: '2026-11-20T19:00' }))
    expect(shown.outcome).toBe('applied')
    expect(shown.result).toMatchObject({ shown: true, saved: 'unknown' })
    expect(shown.revision).toBe(before + 1)
    const refused = receiptFor(parseProposal({ title: 'x', start: 'soon' }))
    expect(refused.outcome).toBe('rejected')
    expect(refused.reason).toContain('start')
    expect(phoneTurnOptions().clientSurface.revision).toBe(before + 2)
  })

  test('the declaration is one presentation operation with a name Theorem accepts', () => {
    expect(PHONE_OPERATIONS).toHaveLength(1)
    expect(PHONE_OPERATIONS[0]!.name).toBe(PROPOSE_EVENT)
    expect(PROPOSE_EVENT).toMatch(/^[a-z][a-z0-9_.]{2,63}$/)
    expect(PHONE_OPERATIONS[0]!.effect).toBe('presentation')
  })

  test('only a save or a cancel becomes a line for the person to send', () => {
    const parsed = parseProposal({ title: 'Open studio', start: '2026-11-20T19:30' })
    if (!parsed.ok) throw new Error(parsed.reason)
    expect(outcomeLine('saved', parsed.proposal)).toBe('I saved “Open studio” to my calendar.')
    expect(outcomeLine('canceled', parsed.proposal)).toContain('did not add')
    expect(outcomeLine('done', parsed.proposal)).toBeUndefined()
    expect(outcomeWords('done')).toContain('not told')
  })
})
