// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import { deviceChecks, initial, reduce, staleness, statusLine, type Frame } from './session'

const frame = (sequence: number, capturedAtMs = sequence * 1000): Frame => ({
  sequence,
  uri: `file:///f${sequence}.jpg`,
  width: 590,
  height: 1280,
  capturedAtMs,
})
const capturing = reduce(reduce(initial, { type: 'state', state: 'picking', reason: '', microphone: false, atMs: 0 }), {
  type: 'state',
  state: 'capturing',
  reason: '',
  microphone: true,
  atMs: 10,
})

describe('a screen-sharing session', () => {
  test('says what is captured, and that the microphone is on only when the person turned it on', () => {
    expect(statusLine(initial).label).toBe('Not sharing')
    expect(statusLine(capturing).detail).toContain('and the microphone')
    const silent = reduce(initial, { type: 'state', state: 'capturing', reason: '', microphone: false, atMs: 1 })
    expect(statusLine(silent).detail).toContain('The microphone is off')
  })

  test('an older frame never replaces a newer one', () => {
    const two = reduce(capturing, { type: 'frame', frame: frame(2), appActive: true })
    expect(reduce(two, { type: 'frame', frame: frame(1), appActive: true }).frame?.sequence).toBe(2)
  })

  test('frames delivered while the app is not in front are counted apart', () => {
    let session = reduce(capturing, { type: 'frame', frame: frame(1), appActive: true })
    session = reduce(session, { type: 'frame', frame: frame(2), appActive: false })
    session = reduce(session, { type: 'frame', frame: frame(3), appActive: false })
    expect(session.frames).toBe(3)
    expect(session.framesWhileAway).toBe(2)
    const checks = deviceChecks(session)
    expect(checks[0]!.seen).toBe(true)
    expect(checks[1]!.seen).toBe(true)
    // What a count cannot show stays open for the person.
    expect(checks.slice(2).every((check) => check.seen === undefined)).toBe(true)
  })

  test('a still is live only while sharing and only for a few seconds', () => {
    const one = reduce(capturing, { type: 'frame', frame: frame(1, 1_000), appActive: true })
    expect(staleness(one, 2_000)).toBe('live')
    expect(staleness(one, 9_000)).toBe('old')
    const ended = reduce(one, { type: 'state', state: 'stopped', reason: 'You stopped sharing.', microphone: false, atMs: 3_000 })
    expect(staleness(ended, 2_000)).toBe('ended')
    expect(ended.frame?.sequence).toBe(1)
    expect(statusLine(ended).detail).toBe('You stopped sharing.')
    expect(staleness(initial, 0)).toBe('none')
  })

  test('starting again begins a new count', () => {
    const one = reduce(capturing, { type: 'frame', frame: frame(5), appActive: false })
    const again = reduce(one, { type: 'state', state: 'picking', reason: '', microphone: false, atMs: 9 })
    expect(again).toMatchObject({ phase: 'picking', frames: 0, framesWhileAway: 0 })
    expect(again.frame).toBeUndefined()
  })

  test('a failure carries the system’s reason', () => {
    const failed = reduce(initial, { type: 'state', state: 'failed', reason: 'Not permitted', microphone: false, atMs: 1 })
    expect(statusLine(failed)).toMatchObject({ label: 'Could not share', detail: 'Not permitted', tone: 'error' })
  })
})
