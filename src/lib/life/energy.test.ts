import { describe, expect, test } from 'bun:test'
import {
  RESTING,
  beat,
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

describe('beat', () => {
  test('at rest a generation takes two thirds of a second', () => {
    const half = beat(0, 1 / 3, RESTING.level, true)
    expect(half.steps).toBe(0)
    expect(half.phase).toBeCloseTo(0.5)
    expect(beat(half.phase, 1 / 3 + 0.01, RESTING.level, true).steps).toBe(1)
  })

  test('a step carries the time past it into the next generation', () => {
    const next = beat(0.9, 0.1, RESTING.level, true)
    expect(next.steps).toBe(1)
    expect(next.phase).toBeCloseTo(0.05)
  })

  test('a pulse mid-generation hurries it on from where it stood instead of cutting it short', () => {
    // Frame by frame at 60 fps, with two tool calls landing half way through a generation.
    const frame = 1 / 60
    let energy = RESTING
    let phase = 0
    for (let i = 0; i < 120; i++) {
      if (i === 20) energy = pulse(pulse(energy, 'tool'), 'tool')
      energy = decay(energy, frame)
      const next = beat(phase, frame, energy.level, true)
      if (next.steps === 0) expect(next.phase).toBeGreaterThan(phase)
      // A step lands only once the generation it ends has run its full course.
      else expect(phase + frame * pace(energy.level)).toBeGreaterThanOrEqual(1)
      if (i === 20) expect(next).toMatchObject({ steps: 0 })
      phase = next.phase
    }
  })

  test('paused, the generation in hand runs out and no step is taken', () => {
    expect(beat(0.5, 10, RESTING.level, false)).toEqual({ phase: 1, steps: 0 })
  })
})
