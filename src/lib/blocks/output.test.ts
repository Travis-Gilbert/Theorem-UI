// SOURCING: bun:test over pinned output Markdown (output.ts, format.ts).
import { describe, expect, test } from 'bun:test'
import { liveBlocksIn, serializeLiveBlock } from './format'
import { outputMarkdown, withPinnedOutput, withoutPinnedOutput } from './output'
import type { QueryResult } from './query'

describe('pinned output', () => {
  test('a query pins its first view as a table', () => {
    const result: QueryResult = {
      views: [
        {
          type: 'table',
          name: 'Habits',
          columns: [
            { key: 'habit', label: 'Habit' },
            { key: 'done', label: 'Done' },
          ],
          rows: [
            { habit: 'run', done: 1 },
            { habit: 'read|write', done: null },
          ],
          groups: null,
          summaries: {},
          dateKey: null,
          total: 2,
        },
      ],
      rows: [],
      errors: [],
    }
    expect(outputMarkdown(result)).toBe(
      [
        '| Habit       | Done |',
        '| ----------- | ---- |',
        '| run         | 1    |',
        '| read\\|write |      |',
      ].join('\n'),
    )
  })

  test('values, rows, agent runs and interactive output read as Markdown', () => {
    expect(outputMarkdown(4)).toBe('`4`')
    expect(outputMarkdown([{ a: 1 }, { b: 'x' }])).toBe(
      '| a | b |\n| - | - |\n| 1 |   |\n|   | x |',
    )
    expect(
      outputMarkdown({
        status: 'not-wired',
        target: 'agent:#weekly',
        message: 'Recorded the request.',
      }),
    ).toBe('Recorded the request.')
    expect(outputMarkdown(undefined)).toBe(
      '*Interactive output: open this note in Theorem to see it.*',
    )
  })

  test('pinning adds the markers once and refreshing replaces only the body', () => {
    const [block] = liveBlocksIn('```ts {.live #n}\n2 + 2\n```\n')
    const pinned = withPinnedOutput(block!, 'n', 4)
    expect(serializeLiveBlock(pinned)).toBe(
      '```ts {.live #n}\n2 + 2\n```\n\n<!-- theorem:output #n -->\n\n`4`\n\n<!-- /theorem:output -->',
    )
    const [again] = liveBlocksIn(`${serializeLiveBlock(pinned)}\n`)
    expect(serializeLiveBlock(withPinnedOutput(again!, 'n', 5))).toBe(
      serializeLiveBlock(pinned).replace('`4`', '`5`'),
    )
    expect(serializeLiveBlock(withoutPinnedOutput(again!))).toBe(
      '```ts {.live #n}\n2 + 2\n```',
    )
  })
})
