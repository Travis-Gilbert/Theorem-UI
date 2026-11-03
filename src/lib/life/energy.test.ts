import { describe, expect, test } from 'bun:test'
import {
  RESTING,
  decay,
  glow,
  pace,
  pulse,
  pulsesBetween,
  pulsesSince,
  restSeconds,
  signalOf,
  sustain,
} from './energy'

describe('energy', () => {
  test('a tool call lifts the field far more than a run of text', () => {
    const tool = pulse(RESTING, 'tool').level
    const text = pulse(RESTING, 'text').level
    const thought = pulse(RESTING, 'reasoning').level
    expect(tool).toBeGreaterThan(thought)
    expect(thought).toBeGreaterThan(text)
    expect(text).toBeGreaterThan(0)
  })

  test('never rises above full', () => {
    let energy = RESTING
    for (let i = 0; i < 20; i++) energy = pulse(energy, 'tool')
    expect(energy.level).toBe(1)
  })

  test('settles back to rest once the model goes quiet', () => {
    const lifted = pulse(pulse(RESTING, 'tool'), 'tool')
    const later = decay(lifted, 2)
    expect(later.level).toBeLessThan(lifted.level)
    expect(decay(lifted, 60).level).toBeLessThan(0.01)
  })

  test('a running turn holds a floor the level does not decay below', () => {
    const running = sustain(RESTING, true)
    const settled = decay(running, 60)
    expect(settled.level).toBeGreaterThan(0.1)
    expect(decay(sustain(settled, false), 60).level).toBeLessThan(0.01)
  })

  test('the field crawls at rest and races under load', () => {
    expect(pace(0)).toBeLessThanOrEqual(2)
    expect(pace(1)).toBeGreaterThanOrEqual(20)
    expect(pace(0.5)).toBeGreaterThan(pace(0.2))
  })

  test('the field is dimmer at rest than under load', () => {
    expect(glow(0)).toBeLessThan(glow(1))
    expect(glow(1)).toBe(1)
  })

  test('the presence rests long when idle and barely at all when busy', () => {
    expect(restSeconds(0)).toBeGreaterThan(8)
    expect(restSeconds(1)).toBeLessThan(1)
  })
})

describe('the working turn', () => {
  const turn = (running: boolean, ...content: Array<{ type: string; text?: string }>) => ({
    status: { type: running ? 'running' : 'complete' },
    content,
  })

  test('counts tool calls, delegations, and reasoning and text by length', () => {
    const signal = signalOf(
      turn(
        true,
        { type: 'reasoning', text: 'x'.repeat(900) },
        { type: 'tool-call' },
        { type: 'data' },
        { type: 'text', text: 'y'.repeat(450) },
      ),
    )
    expect(signal).toEqual({ running: true, tools: 2, thoughts: 3, words: 1 })
  })

  test('no message is a quiet turn', () => {
    expect(signalOf(undefined)).toEqual({ running: false, tools: 0, thoughts: 0, words: 0 })
  })

  test('each new tool call and each new stretch of thought is a pulse', () => {
    const before = { running: true, tools: 1, thoughts: 2, words: 0 }
    const after = { running: true, tools: 3, thoughts: 3, words: 1 }
    expect(pulsesBetween(before, after)).toEqual(['tool', 'tool', 'reasoning', 'text'])
  })

  test('a new turn starting from zero counts nothing as lost', () => {
    const before = { running: false, tools: 4, thoughts: 6, words: 3 }
    const after = { running: true, tools: 0, thoughts: 0, words: 0 }
    expect(pulsesBetween(before, after)).toEqual([])
  })
})

describe('reading the last message over time', () => {
  const busy = { running: true, tools: 3, thoughts: 2, words: 0 }
  const done = { ...busy, running: false }

  test('a thread that loads finished does not pulse', () => {
    expect(pulsesSince({ id: undefined, signal: signalOf(undefined) }, { id: 'old', signal: done })).toEqual([])
  })

  test('a new message that is running counts all it has done', () => {
    expect(pulsesSince({ id: 'a', signal: done }, { id: 'b', signal: busy })).toEqual([
      'tool',
      'tool',
      'tool',
      'reasoning',
      'reasoning',
    ])
  })

  test('the same message counts only what it added, even as it finishes', () => {
    expect(pulsesSince({ id: 'b', signal: busy }, { id: 'b', signal: { ...done, tools: 4 } })).toEqual(['tool'])
  })
})
