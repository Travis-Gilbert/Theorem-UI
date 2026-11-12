// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import type { ConversationState } from '@theoremharness/sdk'
import { accept, can, fresh, livenessOf, Shown, type Activity } from './activity'
import { activityOfConversation } from './from-thread'

const base: Activity = {
  activityId: 'a',
  generation: 2,
  revision: 5,
  environment: { kind: 'theorem', authority: 'https://t.example' },
  title: 'Compare the three documents',
  status: 'Working',
  phase: 'working',
  standing: 'in-hand',
  signals: [],
  actions: ['open', 'steer', 'stop'],
}

describe('an activity', () => {
  test('a stale generation or revision is refused and changes nothing', () => {
    expect(accept(base, { ...base, generation: 1, revision: 99 })).toEqual({
      accepted: false,
      reason: 'stale-generation',
    })
    expect(accept(base, { ...base, revision: 5 })).toEqual({ accepted: false, reason: 'stale-revision' })
    expect(accept(base, { ...base, activityId: 'b' })).toEqual({ accepted: false, reason: 'other-activity' })
    expect(accept(base, { ...base, revision: 6 }).accepted).toBe(true)
    expect(accept(base, { ...base, generation: 3, revision: 0 }).accepted).toBe(true)
    expect(accept(undefined, base).accepted).toBe(true)
  })

  test('hiding changes only what the phone shows, until the work moves on', () => {
    const shown = new Shown()
    shown.hide(base)
    expect(shown.visible(base)).toBe(false)
    // More of the same work stays hidden; it is still working and still stoppable.
    const later = { ...base, revision: 9 }
    expect(shown.visible(later)).toBe(false)
    expect(can(later, 'stop')).toBe(true)
    expect(later.phase).toBe('working')
    // It comes back when it needs the person or ends.
    expect(shown.visible({ ...later, phase: 'waiting' })).toBe(true)
    expect(shown.visible({ ...base, generation: 3 })).toBe(true)
  })

  test('stop is offered only while the record lists it and the work is going', () => {
    expect(can(base, 'stop')).toBe(true)
    expect(can({ ...base, actions: ['open'] }, 'stop')).toBe(false)
    expect(can({ ...base, phase: 'done' }, 'stop')).toBe(false)
    expect(can({ ...base, phase: 'done' }, 'open')).toBe(true)
  })

  test('a signal goes stale', () => {
    const signal = { name: 'run.events', value: 3, observedAtMs: 1_000 }
    expect(fresh(signal, 20_000)).toBe(true)
    expect(fresh(signal, 40_000)).toBe(false)
  })

  test('the face follows the phase', () => {
    expect(livenessOf(undefined)).toBe('idle')
    expect(livenessOf(base)).toBe('work')
    expect(livenessOf({ ...base, phase: 'waiting' })).toBe('ask')
  })
})

describe('a conversation as an activity', () => {
  const state = (phase: ConversationState['phase'], runId?: string): ConversationState =>
    ({
      phase,
      snapshot: { thread: { threadId: 't1', title: ' Fix the composer ', revision: 7 } },
      journal: { runId, events: [{}, {}], pending: [] },
    }) as unknown as ConversationState

  test('a thread with no run is not an activity', () => {
    expect(activityOfConversation('https://t.example', state('ready'), 7, 1)).toBeUndefined()
    expect(activityOfConversation('https://t.example', state('running'), 7, 1)).toBeUndefined()
  })

  test('a running conversation is working on Theorem and can be stopped', () => {
    const activity = activityOfConversation('https://t.example', state('running', 'r1'), 7, 1)!
    expect(activity).toMatchObject({
      activityId: 'theorem-thread:t1',
      generation: 7,
      revision: 2,
      title: 'Fix the composer',
      phase: 'working',
      standing: 'in-hand',
      environment: { kind: 'theorem' },
    })
    expect(can(activity, 'stop')).toBe(true)
  })

  test('one waiting on an approval needs the person', () => {
    const activity = activityOfConversation('https://t.example', state('requires-action', 'r1'), 7, 1)!
    expect(activity.standing).toBe('needs-you')
    expect(activity.status).toBe('Needs your choice')
  })
})
