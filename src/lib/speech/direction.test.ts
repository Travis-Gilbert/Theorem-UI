// SOURCING: bun:test; lib/speech/direction's read of a reply and its plan of a performance: energy is the sweep's temperature, a held beat splits only at an opening interjection's own comma and only when at least two words follow it, a take seeds every segment, and nothing is rewritten — only split, at a comma the reply already had.
import { describe, expect, test } from 'bun:test'
import { directionFromReply, plan, TEMPERATURE } from './direction'

describe('reading a reply for its direction', () => {
  test('an exclamation at the end leans the energy up', () => {
    expect(directionFromReply('It worked!')).toEqual({
      energy: 'high',
      held: false,
    })
  })
  test('an opening interjection asks for its beat', () => {
    expect(directionFromReply('Oh, that actually worked.')).toEqual({
      energy: 'even',
      held: true,
    })
  })
  test('an ordinary reply asks for nothing', () => {
    expect(
      directionFromReply('There are two different problems here.'),
    ).toEqual({
      energy: 'even',
      held: false,
    })
  })
})

describe('planning a performance', () => {
  test('an ordinary reply is one segment at the even temperature', () => {
    expect(plan('There are two different problems here.')).toEqual([
      {
        text: 'There are two different problems here.',
        gap: 0,
        temperature: TEMPERATURE.even,
        seed: undefined,
      },
    ])
  })
  test('energy is the sweep’s temperature', () => {
    expect(plan('Done.', { energy: 'low' })[0]?.temperature).toBe(0.2)
    expect(plan('Done.', { energy: 'high' })[0]?.temperature).toBe(0.45)
  })
  test('a held beat splits the interjection off and holds the measured beat', () => {
    const segments = plan('Oh, that actually worked.', { held: true })
    expect(segments.map((s) => s.text)).toEqual([
      'Oh,',
      'that actually worked.',
    ])
    expect(segments[0]?.gap).toBe(0.35)
    expect(segments[1]?.gap).toBe(0)
  })
  test('a comma that is not an interjection’s is read through', () => {
    expect(plan('Yes to both, and then some.', { held: true })).toHaveLength(1)
  })
  test('a beat with less than two words after it is no beat', () => {
    expect(plan('Well, no.', { held: true })).toHaveLength(1)
  })
  test('a take seeds every segment', () => {
    const segments = plan('Oh, that actually worked.', { held: true, take: 23 })
    expect(segments.map((s) => s.seed)).toEqual([23, 23])
  })
  test('marks are off the spoken segments', () => {
    expect(plan('**Done.** See `the log`.')).toEqual([
      {
        text: 'Done. See the log.',
        gap: 0,
        temperature: TEMPERATURE.even,
        seed: undefined,
      },
    ])
  })
  test('nothing to say is no segments', () => {
    expect(plan('   ')).toEqual([])
  })
})
