// SOURCING: bun:test, the runner bun ships. The checks follow the brief's state table.
import { describe, expect, test } from 'bun:test'
import { coverIsUp, initialReveal, phaseOf, reveal } from './machine'
import type { RevealEvent, RevealState } from './machine'

const run = (start: RevealState, ...events: RevealEvent['type'][]) =>
  events.reduce(
    (state, type) => reveal(state, { type } as RevealEvent),
    start,
  )
const fresh = initialReveal(true)

describe('the reveal gate', () => {
  test('opens at ambient and does not load the app', () => {
    expect(phaseOf(fresh, true)).toBe('ambient')
    expect(fresh.app).toBe('idle')
  })

  test('play starts the film and begins loading behind it', () => {
    const state = run(fresh, 'play')
    expect(phaseOf(state, false)).toBe('watching')
    expect(state.app).toBe('loading')
  })

  test('app ready during the film does not reveal it', () => {
    expect(phaseOf(run(fresh, 'play', 'app-ready'), true)).toBe('watching')
  })

  test('film end with the app still loading holds at preparing', () => {
    const state = run(fresh, 'play', 'film-ended')
    expect(phaseOf(state, true)).toBe('preparing')
    expect(coverIsUp(state, phaseOf(state, true))).toBe(true)
  })

  test('skip completes the film condition and nothing else', () => {
    const state = run(fresh, 'play', 'film-skipped')
    expect(state.film).toBe('done')
    expect(phaseOf(state, true)).toBe('preparing')
    expect(phaseOf(run(state, 'app-ready'), true)).toBe('live')
  })

  test('all three conditions are required, in any order', () => {
    const conditions: Array<[RevealEvent['type'], boolean]> = [
      ['film-ended', true],
      ['app-ready', true],
    ]
    for (const order of [conditions, [...conditions].reverse()]) {
      let state = run(fresh, 'play')
      for (const [type] of order) {
        expect(phaseOf(state, true)).not.toBe('live')
        state = reveal(state, { type } as RevealEvent)
      }
      expect(phaseOf(state, false)).toBe('preparing')
      expect(phaseOf(state, true)).toBe('live')
    }
  })

  test('try enters directly, and only try may move focus', () => {
    const tried = run(fresh, 'try')
    expect(tried.film).toBe('done')
    expect(tried.entry).toBe('try')
    expect(phaseOf(run(tried, 'app-ready'), true)).toBe('live')
    expect(run(fresh, 'play', 'film-ended').entry).toBe('film')
  })

  test('try during the film is a skip', () => {
    const state = run(fresh, 'play', 'try')
    expect(state.film).toBe('done')
    expect(state.entry).toBe('try')
  })

  test('an app failure leaves the film running, then shows unavailable', () => {
    const during = run(fresh, 'play', 'app-failed')
    expect(phaseOf(during, true)).toBe('watching')
    expect(phaseOf(run(during, 'film-ended'), true)).toBe('unavailable')
  })

  test('retry goes back to preparing with the still up', () => {
    const state = run(fresh, 'try', 'app-failed', 'retry')
    expect(phaseOf(state, true)).toBe('preparing')
    expect(phaseOf(run(state, 'app-ready'), true)).toBe('live')
  })

  test('a film failure leaves the visitor at ambient with the app still coming', () => {
    const state = run(fresh, 'play', 'film-failed')
    expect(phaseOf(state, true)).toBe('ambient')
    expect(state.film).toBe('failed')
    expect(state.app).toBe('loading')
    expect(phaseOf(run(state, 'try', 'app-ready'), true)).toBe('live')
  })

  test('navigating away stops the film and it does not replay on return', () => {
    const state = run(fresh, 'play', 'leave')
    expect(state.film).toBe('idle')
    expect(phaseOf(state, true)).toBe('ambient')
  })

  test('leaving the live app keeps it, and returning does not replay', () => {
    const state = run(fresh, 'try', 'app-ready', 'entered', 'leave')
    expect(state.engaged).toBe(true)
    expect(phaseOf(state, true)).toBe('live')
    expect(state.film).toBe('done')
  })

  test('the still never covers an app the visitor has used', () => {
    const state = run(fresh, 'try', 'app-ready', 'entered')
    expect(coverIsUp(state, phaseOf(state, false))).toBe(false)
  })

  test('an explicit replay covers the app and keeps it', () => {
    const state = run(fresh, 'try', 'app-ready', 'entered', 'play')
    expect(phaseOf(state, true)).toBe('watching')
    expect(state.app).toBe('ready')
    expect(phaseOf(run(state, 'film-ended'), true)).toBe('live')
  })

  test('back returns to the wide view without losing the app', () => {
    const state = run(fresh, 'try', 'app-ready', 'entered', 'back')
    expect(phaseOf(state, true)).toBe('ambient')
    expect(state.app).toBe('ready')
    expect(state.entered).toBe(true)
  })

  test('with no app configured the film still works and ends unavailable', () => {
    const none = initialReveal(false)
    const state = run(none, 'play')
    expect(state.app).toBe('absent')
    expect(phaseOf(state, true)).toBe('watching')
    expect(phaseOf(run(state, 'film-ended'), true)).toBe('unavailable')
    expect(run(none, 'try', 'retry').app).toBe('absent')
  })

  test('late events from a stopped film change nothing', () => {
    const stopped = run(fresh, 'play', 'leave')
    expect(run(stopped, 'film-ended')).toEqual(stopped)
    expect(run(stopped, 'film-failed')).toEqual(stopped)
  })

  test('a frame that lost its document loads again behind what the visitor left', () => {
    const state = run(fresh, 'try', 'app-ready', 'entered', 'reload')
    expect(state.app).toBe('loading')
    expect(coverIsUp(state, phaseOf(state, true))).toBe(false)
    expect(phaseOf(run(state, 'app-ready'), true)).toBe('live')
    expect(run(fresh, 'reload')).toEqual(fresh)
  })

  test('ready from a load the visitor already retried past is ignored once failed', () => {
    const failed = run(fresh, 'try', 'app-failed')
    expect(run(failed, 'app-ready').app).toBe('failed')
  })
})
