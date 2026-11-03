import { describe, expect, test } from 'bun:test'
import { createField, paint } from './life'
import {
  REST_SECONDS,
  WORK_SECONDS,
  advance,
  attend,
  companion,
  createPresence,
  figure,
  finish,
  work,
} from './presence'
import type { Presence } from './presence'

const run = (presence: Presence, seconds: number, options = {}) => {
  let p = presence
  for (let t = 0; t < seconds; t += 1 / 60) p = advance(p, 1 / 60, options)
  return p
}

const distance = (p: Presence) =>
  Math.hypot(p.target.x - p.at.x, p.target.y - p.at.y)

describe('advance', () => {
  test('an attending presence travels to its target and settles there', () => {
    const p = run(attend(createPresence({ x: 0, y: 0 }), { x: 20, y: 10 }), 2)
    expect(distance(p)).toBeLessThan(0.1)
  })

  test('it overshoots on the way, as the rest of Theorem springs', () => {
    let p = attend(createPresence({ x: 0, y: 0 }), { x: 20, y: 0 })
    let furthest = 0
    for (let i = 0; i < 120; i++) {
      p = advance(p, 1 / 60)
      furthest = Math.max(furthest, p.at.x)
    }
    expect(furthest).toBeGreaterThan(20)
  })

  test('moving leaves a trail of sparks that fade away once it stops', () => {
    const moving = run(attend(createPresence({ x: 0, y: 0 }), { x: 30, y: 0 }), 0.3)
    expect(moving.sparks.length).toBeGreaterThan(0)
    const settled = run(moving, 3)
    expect(settled.sparks).toEqual([])
  })

  test('a quiet presence still moves but leaves no new trail', () => {
    const p = run(attend(createPresence({ x: 0, y: 0 }), { x: 30, y: 0 }), 0.3, {
      quiet: true,
    })
    expect(p.at.x).toBeGreaterThan(1)
    expect(p.sparks).toEqual([])
  })

  test('under reduced motion it is already where it is going, with no sparks', () => {
    const p = advance(attend(createPresence({ x: 0, y: 0 }), { x: 30, y: 4 }), 1 / 60, {
      still: true,
    })
    expect(p.at).toEqual({ x: 30, y: 4 })
    expect(p.sparks).toEqual([])
  })
})

describe('finish', () => {
  test('returns to rest and hands a seed to the field where it stood', () => {
    const working = work(createPresence({ x: 7, y: 3 }))
    const { presence, seed } = finish(working, () => 0)
    expect(presence.activity).toBe('resting')
    expect(seed).toEqual({ pattern: 'glider', x: 7, y: 3 })
  })

  test('disperses its glyphs outward as sparks', () => {
    const { presence } = finish(work(createPresence({ x: 0, y: 0 })), () => 0.5)
    expect(presence.sparks.length).toBeGreaterThan(4)
    const later = run(presence, 0.2)
    const spread = Math.max(...later.sparks.map((s) => Math.hypot(s.x, s.y)))
    expect(spread).toBeGreaterThan(1)
  })
})

describe('figure', () => {
  test('gathers into a wider orb while working than at rest', () => {
    const reach = (p: Presence) =>
      Math.max(...figure(p, 1, 2).map((g) => Math.hypot(g.dx / 2, g.dy)))
    const resting = createPresence({ x: 0, y: 0 })
    const working = run(work(resting), 1)
    expect(reach(working)).toBeGreaterThan(reach(resting) + 1)
  })
})

describe('companion', () => {
  const busy = paint(createField(40, 20), 30, 15, true)

  test('after resting a while it goes to attend to a living cell', () => {
    const rested = run(createPresence({ x: 0, y: 0 }), REST_SECONDS + 0.1)
    const { presence } = companion(rested, busy, { random: () => 0.5 })
    expect(presence.activity).toBe('attending')
    expect(presence.target).toEqual({ x: 30, y: 15 })
  })

  test('does not start anything new while the person is drawing', () => {
    const rested = run(createPresence({ x: 0, y: 0 }), REST_SECONDS + 0.1)
    const { presence } = companion(rested, busy, {
      random: () => 0.5,
      personActive: true,
    })
    expect(presence.activity).toBe('resting')
  })

  test('rests as long as it is told to before looking again', () => {
    const briefly = run(createPresence({ x: 0, y: 0 }), 0.6)
    expect(companion(briefly, busy, { random: () => 0.5 }).presence.activity).toBe('resting')
    expect(companion(briefly, busy, { random: () => 0.5, rest: 0.5 }).presence.activity).toBe(
      'attending',
    )
  })

  test('arriving starts work, and finished work seeds the field', () => {
    const arrived = run(attend(createPresence({ x: 0, y: 0 }), { x: 4, y: 4 }), 2)
    const working = companion(arrived, busy, { random: () => 0 }).presence
    expect(working.activity).toBe('working')
    const done = companion(run(working, WORK_SECONDS + 0.1), busy, {
      random: () => 0,
    })
    expect(done.presence.activity).toBe('resting')
    expect(done.seed?.pattern).toBeDefined()
  })
})
