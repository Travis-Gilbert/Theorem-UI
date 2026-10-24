// SOURCING: bun:test over Embark mentions and chained formulas (embark.ts),
// run in the QuickJS test engine from test/blocks/.
import { describe, expect, test } from 'bun:test'
import { testFormulaEngine } from '../../../test/blocks/formula-engine'
import { computeEmbark, parseEmbark, recordsUnder } from './embark'

const trip = `---
currency: JPY
---
# Japan

## Trip [budget:: 3000] [left:: = (prev ? prev.left : budget) - (cost ?? 0)]

- @2026-11-02 Hotel in [[Kyoto]] [cost:: 200]
- @2026-11-01 Flight [cost:: 900]
  - Seat 32A [seat:: 32A]
- Pack bags \`[not:: a field]\`

### @2026-11-03 Osaka

- Ramen [cost:: 30]

## Notes

mood:: good
`

describe('mentions', () => {
  test('fields, dates and links are read from each outline node', () => {
    const { records } = parseEmbark(trip)
    expect(records.map((r) => [r.text, r.date, r.links])).toEqual([
      ['Hotel in [[Kyoto]]', '2026-11-02', ['Kyoto']],
      ['Flight', '2026-11-01', []],
      ['Seat 32A', '2026-11-01', []],
      ['Ramen', '2026-11-03', []],
      ['', null, []],
    ])
    expect(records[2]?.values).toEqual({
      currency: 'JPY',
      budget: 3000,
      cost: 900,
      seat: '32A',
    })
    expect(records[4]?.values).toEqual({ currency: 'JPY', mood: 'good' })
  })

  test('properties inherit down the subtree, and a date heading dates what is under it', () => {
    const { records } = parseEmbark(trip)
    const ramen = records.find((r) => r.text === 'Ramen')!
    expect(ramen.values).toEqual({ currency: 'JPY', budget: 3000, cost: 30 })
    expect(ramen.heading).toBe('Osaka')
    expect(Object.keys(ramen.formulas)).toEqual(['left'])
  })

  test('a query collects the mentions of its own section, or of a named heading', () => {
    const document = parseEmbark(trip)
    const inTrip = recordsUnder(document, { line: 9 })
    expect(inTrip.map((r) => r.text)).toEqual([
      'Hotel in [[Kyoto]]',
      'Flight',
      'Seat 32A',
      'Ramen',
    ])
    expect(
      recordsUnder(document, { heading: 'osaka' }).map((r) => r.text),
    ).toEqual(['Ramen'])
    expect(() => recordsUnder(document, { heading: 'Nowhere' })).toThrow(
      'No heading "Nowhere"',
    )
  })

  test('per-day formulas chain through the days in date order', async () => {
    const { records } = parseEmbark(trip)
    const { records: computed, errors } = await computeEmbark(
      records,
      await testFormulaEngine(),
      '2026-10-23',
    )
    expect(errors).toEqual([])
    const left = Object.fromEntries(
      computed
        .filter((r) => 'left' in r.formulas)
        .map((r) => [r.text, r.values.left]),
    )
    // The chain follows the dates: the flight (11-01) comes before the hotel.
    expect(left).toEqual({
      Flight: 2100,
      'Hotel in [[Kyoto]]': 1900,
      Ramen: 1870,
    })
    // The seat is a detail of the flight: it shows the flight's values.
    expect(computed.find((r) => r.text === 'Seat 32A')?.values.left).toBe(2100)
  })
})
