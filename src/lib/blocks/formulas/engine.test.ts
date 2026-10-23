import { describe, expect, test } from 'bun:test'
import { testFormulaEngine } from '../../../../test/blocks/formula-engine'

const today = '2026-10-23'

describe('the formula engine', () => {
  test('formulas read columns, other formulas and helpers', async () => {
    const engine = await testFormulaEngine()
    const output = await engine({
      kind: 'rows',
      today,
      rows: [{ values: { price: 12, quantity: 4, bought: '2026-10-20' } }],
      formulas: {
        unit: 'price / quantity',
        label: '`${formula.unit} each`',
        age: 'daysBetween(bought, today())',
      },
      filters: [],
      self: null,
    })
    expect(output.rows[0]).toEqual({
      formula: { unit: 3, label: '3 each', age: 3 },
      errors: {},
    })
  })

  test('filters nest as Bases writes them', async () => {
    const engine = await testFormulaEngine()
    const rows = [
      { values: { status: 'done', price: 1 } },
      { values: { status: 'open', price: 5 } },
      { values: { status: 'open', price: 1 } },
    ]
    const output = await engine({
      kind: 'rows',
      today,
      rows,
      formulas: {},
      filters: [
        { and: ['status != "done"', { or: ['price > 2', 'price < 0'] }] },
        { not: ['status == "done"'] },
        null,
      ],
      self: null,
    })
    expect(output.passed).toEqual([
      [false, true, false],
      [false, true, true],
      [true, true, true],
    ])
  })

  test('file facts and functions', async () => {
    const engine = await testFormulaEngine()
    const output = await engine({
      kind: 'rows',
      today,
      rows: [
        {
          values: { tags: ['book'] },
          file: {
            name: 'Dune',
            path: 'Reading/Dune.md',
            folder: 'Reading',
            ext: 'md',
            size: 10,
            mtime: '2026-10-01T00:00:00.000Z',
            tags: ['book'],
            links: ['Frank Herbert.md'],
          },
        },
      ],
      formulas: {},
      filters: [
        'file.hasTag("#book") && file.inFolder("Reading") && file.hasLink("Frank Herbert")',
        'file.ext == "md" && this.name == "Today"',
      ],
      self: { name: 'Today' },
    })
    expect(output.passed).toEqual([[true], [true]])
  })

  test('a broken formula is that cell’s error, not the query’s', async () => {
    const engine = await testFormulaEngine()
    const output = await engine({
      kind: 'rows',
      today,
      rows: [{ values: { a: 1 } }],
      formulas: { bad: 'a.b.c', loop: 'formula.loop + 1', ok: 'a + 1' },
      filters: ['a.b.c'],
      self: null,
    })
    expect(output.rows[0]?.formula).toEqual({ bad: null, loop: null, ok: 2 })
    expect(Object.keys(output.rows[0]!.errors)).toEqual(['bad', 'loop'])
    expect(output.rows[0]?.errors.loop).toContain('uses itself')
    expect(output.passed).toEqual([[false]])
    expect(output.filterErrors[0]).toStartWith('a.b.c:')
  })

  test('per-day formulas chain through prev in date order', async () => {
    const engine = await testFormulaEngine()
    const formulas = {
      left: { expression: '(prev ? prev.left : budget) - cost', scope: 1 },
    }
    const output = await engine({
      kind: 'chain',
      today,
      records: [
        // Written out of order: the chain follows the dates.
        { date: '2026-11-02', values: { budget: 3000, cost: 200 }, formulas },
        { date: '2026-11-01', values: { budget: 3000, cost: 900 }, formulas },
        { date: '2026-11-03', values: { budget: 3000, cost: 30 }, formulas },
      ],
    })
    expect(output.records.map((r) => r.values.left)).toEqual([1900, 2100, 1870])
  })

  test('a runaway formula is stopped at the deadline', async () => {
    const engine = await testFormulaEngine()
    const spin = engine({
      kind: 'rows',
      today,
      rows: [{ values: {} }],
      formulas: { spin: '(() => { while (true) {} })()' },
      filters: [],
      self: null,
    })
    expect(spin).rejects.toThrow('were stopped')
    await spin.catch(() => {})
  }, 10_000)

  test('nothing of the page is in reach', async () => {
    const engine = await testFormulaEngine()
    const output = await engine({
      kind: 'rows',
      today,
      rows: [{ values: {} }],
      formulas: {
        page: '[typeof process, typeof fetch, typeof document, typeof Bun, typeof require].join()',
      },
      filters: [],
      self: null,
    })
    expect(output.rows[0]?.formula.page).toBe(
      'undefined,undefined,undefined,undefined,undefined',
    )
  })
})
