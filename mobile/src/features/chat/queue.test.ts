// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import { availability, emptyQueue, reduce, type QueueEvent, type QueueState } from './queue'

const msg = (id: string, text = id) => ({ id, text })

/** Runs events in order and collects what was handed out for sending. */
function run(events: QueueEvent[], from: QueueState = { ...emptyQueue, availability: 'idle' }) {
  const sent: string[] = []
  let state = from
  for (const event of events) {
    const step = reduce(state, event)
    state = step.state
    if (step.dispatch) sent.push(step.dispatch.id)
  }
  return { state, sent }
}

describe('availability', () => {
  test('a run in progress is busy, a lost connection is blocked, anything else is idle', () => {
    expect(availability('running')).toBe('busy')
    expect(availability('requires-action')).toBe('busy')
    expect(availability('reconnecting')).toBe('busy')
    expect(availability('failed')).toBe('blocked')
    expect(availability('authentication-required')).toBe('blocked')
    expect(availability('detached')).toBe('blocked')
    expect(availability('ready')).toBe('idle')
    expect(availability('completed')).toBe('idle')
    expect(availability('cancelled')).toBe('idle')
  })
})

describe('queue reducer', () => {
  test('a message sent while the conversation is free goes at once', () => {
    const { state, sent } = run([{ type: 'submit', message: msg('a') }])
    expect(sent).toEqual(['a'])
    expect(state.items).toEqual([])
    expect(state.inflight?.id).toBe('a')
  })

  test('a message sent during a run is queued, visible and not sent', () => {
    const { state, sent } = run([
      { type: 'availability', availability: 'busy' },
      { type: 'submit', message: msg('a') },
      { type: 'submit', message: msg('b') },
    ])
    expect(sent).toEqual([])
    expect(state.items.map((item) => item.id)).toEqual(['a', 'b'])
  })

  test('the queue goes one at a time, first in first out, as the conversation frees up', () => {
    const { state, sent } = run([
      { type: 'availability', availability: 'busy' },
      { type: 'submit', message: msg('a') },
      { type: 'submit', message: msg('b') },
      { type: 'availability', availability: 'idle' },
    ])
    expect(sent).toEqual(['a'])
    expect(state.items.map((item) => item.id)).toEqual(['b'])
    // a's send returns but its run has not shown yet: b still waits for the run.
    const next = run(
      [
        { type: 'sent', id: 'a' },
        { type: 'availability', availability: 'busy' },
        { type: 'availability', availability: 'idle' },
      ],
      state,
    )
    expect(next.sent).toEqual(['b'])
  })

  test('two quick sends while free do not overlap: the second waits for the first to settle', () => {
    const { sent, state } = run([
      { type: 'submit', message: msg('a') },
      { type: 'submit', message: msg('b') },
    ])
    expect(sent).toEqual(['a'])
    expect(state.items.map((item) => item.id)).toEqual(['b'])
  })

  test('nothing goes while the connection is blocked, and it goes once restored', () => {
    const { sent } = run([
      { type: 'availability', availability: 'busy' },
      { type: 'submit', message: msg('a') },
      { type: 'availability', availability: 'blocked' },
      { type: 'availability', availability: 'idle' },
    ])
    expect(sent).toEqual(['a'])
  })

  test('Stop pauses draining: the queue stays until the person sends again', () => {
    const stopped = run([
      { type: 'availability', availability: 'busy' },
      { type: 'submit', message: msg('a') },
      { type: 'stopped' },
      { type: 'availability', availability: 'idle' },
    ])
    expect(stopped.sent).toEqual([])
    expect(stopped.state.paused).toBe(true)
    expect(stopped.state.items.map((item) => item.id)).toEqual(['a'])

    // A new explicit send re-arms, and the older message keeps its place in front.
    const resumed = run([{ type: 'submit', message: msg('b') }], stopped.state)
    expect(resumed.sent).toEqual(['a'])
    expect(resumed.state.paused).toBe(false)
    expect(resumed.state.items.map((item) => item.id)).toEqual(['b'])
  })

  test('a removed message never goes', () => {
    const { sent, state } = run([
      { type: 'availability', availability: 'busy' },
      { type: 'submit', message: msg('a') },
      { type: 'submit', message: msg('b') },
      { type: 'remove', id: 'a' },
      { type: 'availability', availability: 'idle' },
    ])
    expect(sent).toEqual(['b'])
    expect(state.items).toEqual([])
  })

  test('a message keeps its id from the moment it is queued until it is sent', () => {
    const { sent } = run([
      { type: 'availability', availability: 'busy' },
      { type: 'submit', message: msg('a-id', 'words') },
      { type: 'availability', availability: 'idle' },
    ])
    expect(sent).toEqual(['a-id'])
  })

  test('a refusal pauses the queue and hands the words back once, never resending', () => {
    const first = run([
      { type: 'submit', message: msg('a', 'words') },
      { type: 'submit', message: msg('b') },
      { type: 'refused', id: 'a', error: new Error('no') },
    ])
    expect(first.sent).toEqual(['a'])
    expect(first.state.paused).toBe(true)
    expect(first.state.refused.map((entry) => entry.message.text)).toEqual(['words'])
    const acknowledged = reduce(first.state, { type: 'acknowledge', id: 'a' })
    expect(acknowledged.state.refused).toEqual([])
    expect(acknowledged.dispatch).toBeUndefined()
  })

  test('an unrelated settle changes nothing', () => {
    const before: QueueState = { ...emptyQueue, availability: 'idle' }
    expect(reduce(before, { type: 'sent', id: 'ghost' }).state).toBe(before)
    expect(reduce(before, { type: 'availability', availability: 'idle' }).state).toBe(before)
  })
})
