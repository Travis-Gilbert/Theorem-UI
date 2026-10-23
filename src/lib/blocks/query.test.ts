import { describe, expect, test } from 'bun:test'
import { memoryWorkspace } from '../../../test/blocks/memory-workspace'
import { testFormulaEngine } from '../../../test/blocks/formula-engine'
import { parseEmbark } from './embark'
import {
  QueryError,
  parseQuery,
  queryReads,
  runQuery,
  summarize,
} from './query'
import type { QueryContext } from './query'

const client = memoryWorkspace({
  'Data/habits.csv':
    'date,habit,done,minutes\n2026-10-20,run,1,30\n2026-10-20,read,1,20\n2026-10-21,run,0,\n2026-10-22,read,1,45\n',
  'Data/books.json':
    '[{"title":"Dune","pages":412},{"title":"Emma","pages":474}]',
  'Reading/Dune.md': '---\ntags: [book, sf]\nrating: 5\n---\n# Dune\n',
  'Reading/Emma.md': '---\ntags: [book]\nrating: 4\n---\n# Emma\n',
  'Reading/List.md': '# Not a book\n',
})

async function context(
  overrides: Partial<QueryContext> = {},
): Promise<QueryContext> {
  return {
    client,
    engine: await testFormulaEngine(),
    documentPath: 'Today.md',
    line: 1,
    embark: () => parseEmbark(''),
    inputs: {},
    today: '2026-10-23',
    ...overrides,
  }
}

describe('query blocks', () => {
  test('a CSV becomes rows that formulas, filters, sort and summaries shape', async () => {
    const spec = parseQuery(`
from: Data/habits.csv
filters: 'done == 1'
formulas:
  hours: 'minutes / 60'
properties:
  formula.hours: { displayName: Hours }
views:
  - type: table
    order: [date, habit, formula.hours]
    sort: [{ property: minutes, direction: DESC }]
    summaries: { formula.hours: Sum, habit: Unique }
`)
    expect(queryReads(spec)).toEqual(['Data/habits.csv'])
    const result = await runQuery(spec, await context())
    const [table] = result.views
    expect(table?.columns.map((c) => c.label)).toEqual([
      'date',
      'habit',
      'Hours',
    ])
    expect(table?.rows).toEqual([
      { date: '2026-10-22', habit: 'read', 'formula.hours': 0.75 },
      { date: '2026-10-20', habit: 'run', 'formula.hours': 0.5 },
      { date: '2026-10-20', habit: 'read', 'formula.hours': 20 / 60 },
    ])
    expect(table?.summaries).toEqual({
      'formula.hours': 0.75 + 0.5 + 20 / 60,
      habit: 2,
    })
    expect(result.rows).toBe(table!.rows)
  })

  test('each view adds its own filters, groups and limit', async () => {
    const result = await runQuery(
      parseQuery(`
from: Data/habits.csv
views:
  - type: list
    filters: 'habit == "run"'
  - type: table
    groupBy: { property: habit, direction: DESC }
    limit: 3
  - type: calendar
`),
      await context(),
    )
    expect(result.views[0]?.rows.map((r) => r.date)).toEqual([
      '2026-10-20',
      '2026-10-21',
    ])
    expect(result.views[1]?.total).toBe(4)
    expect(
      result.views[1]?.groups?.map((g) => [g.value, g.rows.length]),
    ).toEqual([
      ['run', 2],
      ['read', 1],
    ])
    expect(result.views[2]?.dateKey).toBe('date')
  })

  test('notes are rows with their frontmatter and file facts', async () => {
    const result = await runQuery(
      parseQuery(`
from: Reading/*.md
filters:
  and:
    - file.hasTag("book")
    - 'rating >= 4'
views:
  - order: [file.name, rating]
    sort: [{ property: rating }]
`),
      await context(),
    )
    expect(result.rows).toEqual([
      { 'file.name': 'Emma', rating: 4 },
      { 'file.name': 'Dune', rating: 5 },
    ])
  })

  test('JSON files and other blocks are rows too', async () => {
    const json = await runQuery(
      parseQuery('from: Data/books.json'),
      await context(),
    )
    expect(json.rows.map((r) => r.title)).toEqual(['Dune', 'Emma'])
    const block = await runQuery(
      parseQuery("from: '#streak'\nfilters: 'days > 1'"),
      await context({ inputs: { streak: [{ days: 1 }, { days: 3 }] } }),
    )
    expect(block.rows).toEqual([{ days: 3 }])
  })

  test('mentions collect the query’s own section, formulas chained', async () => {
    const markdown = `# Trip [budget:: 1000] [left:: = (prev ? prev.left : budget) - cost]

- @2026-11-01 Flight [cost:: 600]
- @2026-11-02 Hotel [cost:: 150]

\`\`\`query {.live #spend}
from: mentions
views:
  - order: [mention.text, cost, left]
  - type: calendar
\`\`\`

# Elsewhere

- @2026-12-01 Not this [cost:: 1]
`
    const result = await runQuery(
      parseQuery(
        'from: mentions\nviews:\n  - order: [mention.text, cost, left]\n  - type: calendar',
      ),
      await context({ line: 6, embark: () => parseEmbark(markdown) }),
    )
    expect(result.rows).toEqual([
      { 'mention.text': 'Flight', cost: 600, left: 400 },
      { 'mention.text': 'Hotel', cost: 150, left: 250 },
    ])
    expect(result.views[1]?.dateKey).toBe('mention.date')
    expect(result.views[1]?.rows.map((r) => r['mention.date'])).toEqual([
      '2026-11-01',
      '2026-11-02',
    ])
  })

  test('a mention formula that fails says so, by line, beside the rows', async () => {
    const markdown = `# Trip [left:: = left - cost]

- @2026-11-01 Flight [cost:: 600]
`
    const result = await runQuery(
      parseQuery('from: mentions\nviews:\n  - order: [mention.text, left]'),
      await context({ line: 1, embark: () => parseEmbark(markdown) }),
    )
    expect(result.rows).toEqual([{ 'mention.text': 'Flight', left: null }])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toStartWith('line 3, left: ')
    expect(result.errors[0]).toContain('uses itself')
  })

  test('a body that is not a query says what is wrong', () => {
    expect(() => parseQuery('from: [')).toThrow(QueryError)
    expect(() => parseQuery('views: []')).toThrow(/from/)
    expect(() => parseQuery('from: notes.txt')).toThrow(
      'is not a CSV, TSV, JSON or Markdown file',
    )
  })

  test('summaries follow Bases’ defaults', () => {
    expect(summarize('Average', [1, 2, 3, null])).toBe(2)
    expect(summarize('Range', ['2026-10-01', '2026-10-11'])).toBe(10)
    expect(summarize('Filled', [1, '', null, 0])).toBe(2)
    expect(summarize('Checked', [true, false, true])).toBe(2)
  })
})
