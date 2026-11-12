// SOURCING: bun:test; lib/speech/speakable's own choices about what of a reply is read aloud.
import { describe, expect, test } from 'bun:test'
import { SPOKEN_LIMIT, speakable } from './speakable'

describe('speakable', () => {
  test('plain words are left as they are', () => {
    expect(speakable('The build passed. Two tests were slow.')).toBe(
      'The build passed. Two tests were slow.',
    )
  })

  test('marks that are only for the eye are not read', () => {
    expect(speakable('## What changed\n\nIt is **done**, and _well_.')).toBe(
      'What changed.\nIt is done, and well.',
    )
    expect(speakable('~~Old~~ new, with `bun test` run.')).toBe(
      'Old new, with bun test run.',
    )
    expect(speakable('> A quoted line.\n\n---\n\nAfter the rule.')).toBe(
      'A quoted line.\nAfter the rule.',
    )
  })

  test('a name with marks inside it keeps them', () => {
    expect(speakable('Set snake_case_name and 2 * 3 * 4.')).toBe(
      'Set snake_case_name and 2 * 3 * 4.',
    )
  })

  test('a block of code is named and not read out', () => {
    const spoken = speakable(
      'Run this:\n\n```bash\nrm -rf node_modules && bun install\n```\n\nThen try again.',
    )
    expect(spoken).toBe('Run this:\nA block of code.\nThen try again.')
    // One left open, as a reply still arriving has it, is not read either.
    expect(speakable('Here:\n\n```ts\nconst secret = 1')).toBe(
      'Here:\nA block of code.',
    )
  })

  test('a link is its words, and a bare address is only said to be one', () => {
    expect(
      speakable('See [the plan](https://example.com/plan?x=1) for more.'),
    ).toBe('See the plan for more.')
    expect(speakable('It is at https://example.com/a/b?c=d.')).toBe(
      'It is at a link.',
    )
    expect(speakable('![A chart of the run](chart.png)')).toBe(
      'A chart of the run',
    )
  })

  test('a list item is a sentence, numbered or ticked or not', () => {
    expect(
      speakable('- First thing\n- Second thing.\n1. Third\n- [x] Fourth'),
    ).toBe('First thing.\nSecond thing.\nThird.\nFourth.')
  })

  test('a table is read across, without its rule', () => {
    expect(
      speakable('| Name | State |\n| --- | :-: |\n| build | passed |'),
    ).toBe('Name, State\nbuild, passed')
  })

  test('markup is dropped', () => {
    expect(speakable('Before <br/> after <!-- a note --> done.')).toBe(
      'Before after done.',
    )
  })

  test('nothing to say is nothing', () => {
    expect(speakable('')).toBe('')
    expect(speakable('\n\n---\n\n')).toBe('')
  })

  test('a very long reply is cut at the end of a sentence', () => {
    const long = 'This is one sentence of a reply. '.repeat(400)
    const spoken = speakable(long)
    expect(spoken.length).toBeLessThanOrEqual(SPOKEN_LIMIT)
    expect(spoken.length).toBeGreaterThan(SPOKEN_LIMIT / 2)
    expect(spoken.endsWith('reply.')).toBe(true)
  })
})
