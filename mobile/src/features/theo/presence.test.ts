// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import type { ConversationPhase } from '@theoremharness/sdk'
import type { Stage } from '../intake/model'
import { presenceOf, theoStateOf, type TheoSignals, type TheoState } from './presence'

const signals = (
  phase: ConversationPhase,
  more: Omit<TheoSignals, 'conversation'> = {},
  approvals: Record<string, unknown>[] = [],
): TheoSignals => ({
  conversation: { phase, projection: { approvals } as never },
  ...more,
})

describe('what Theo says, from the event behind it', () => {
  test('every conversation phase maps to one state, or to none when nothing is attached', () => {
    const expected: Record<ConversationPhase, TheoState | undefined> = {
      detached: undefined,
      connecting: 'waiting-for-host',
      ready: 'ready',
      running: 'working',
      'requires-action': 'needs-decision',
      reconnecting: 'recovering',
      'authentication-required': 'cannot-continue',
      failed: 'cannot-continue',
      completed: 'done',
      cancelled: 'cannot-continue',
      interrupted: 'cannot-continue',
    }
    for (const [phase, state] of Object.entries(expected))
      expect(theoStateOf(signals(phase as ConversationPhase))).toBe(state)
  })

  test('a pending approval asks for a decision even while the run reports working', () => {
    expect(theoStateOf(signals('running', {}, [{ id: 'a' }]))).toBe('needs-decision')
  })

  test('an inbox decision asks for a decision, and only when the inbox reports one', () => {
    expect(theoStateOf(signals('ready', { decisionsPending: 1 }))).toBe('needs-decision')
    expect(theoStateOf(signals('ready', { decisionsPending: 0 }))).toBe('ready')
  })

  test('delivery stages that are still the phone and Theorem taking files in read as attaching', () => {
    for (const stage of ['queued', 'uploading', 'uploaded', 'sending'] as Stage[])
      expect(theoStateOf(signals('ready', { delivery: { stage } }))).toBe('reading')
    // Once Theorem accepted it, the run decides what Theo shows.
    expect(theoStateOf(signals('running', { delivery: { stage: 'admitted' } }))).toBe('working')
    expect(theoStateOf(signals('running', { delivery: { stage: 'recorded' } }))).toBe('working')
  })

  test('a refused or failed delivery cannot continue until the person acts', () => {
    expect(theoStateOf(signals('ready', { delivery: { stage: 'failed' } }))).toBe('cannot-continue')
    expect(theoStateOf(signals('ready', { delivery: { stage: 'refused' } }))).toBe('cannot-continue')
  })

  test('an unreachable host waits, a reachable one changes nothing', () => {
    expect(theoStateOf(signals('running', { host: { reachable: false } }))).toBe('waiting-for-host')
    expect(theoStateOf(signals('running', { host: { reachable: true } }))).toBe('working')
  })

  test('composing is listening only when nothing more urgent is true', () => {
    expect(theoStateOf(signals('ready', { composing: true }))).toBe('listening')
    expect(theoStateOf(signals('completed', { composing: true }))).toBe('listening')
    expect(theoStateOf(signals('running', { composing: true }))).toBe('working')
    expect(theoStateOf(signals('failed', { composing: true }))).toBe('cannot-continue')
  })

  test('a stop outranks a decision, which outranks recovery', () => {
    expect(theoStateOf(signals('requires-action', { delivery: { stage: 'refused' } }))).toBe('cannot-continue')
    expect(theoStateOf(signals('reconnecting', { decisionsPending: 1 }))).toBe('needs-decision')
  })
})

describe('how each state presents', () => {
  const states: TheoState[] = [
    'ready',
    'listening',
    'reading',
    'working',
    'waiting-for-host',
    'needs-decision',
    'recovering',
    'done',
    'cannot-continue',
  ]

  test('every state has its own words, so it is understood without colour or motion', () => {
    const labels = states.map((state) => presenceOf(state).label)
    expect(new Set(labels).size).toBe(states.length)
    for (const label of labels) expect(label.trim().length).toBeGreaterThan(0)
  })

  test('no label says the model read, saw or understood a file', () => {
    for (const state of states) expect(presenceOf(state).label).not.toMatch(/\b(read|saw|seen|understood)\b/i)
  })

  test('only a state with something moving, moves', () => {
    for (const state of states) {
      const { motion } = presenceOf(state)
      if (state === 'ready' || state === 'done' || state === 'cannot-continue') expect(motion).toBe('still')
      else expect(motion).not.toBe('still')
    }
  })
})
