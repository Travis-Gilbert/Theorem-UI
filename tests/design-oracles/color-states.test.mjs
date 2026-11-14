import { expect, test } from 'bun:test'
import {
  engines,
  modes,
  stateChecks,
  validateColorStateEvidence,
} from '../../scripts/design-oracles/color-states.mjs'

test('interactive contrast rejects incomplete states and a true below-threshold reading', () => {
  const cases = engines.flatMap((engine) =>
    modes.map((mode) => ({
      engine,
      mode,
      rows: Object.entries(stateChecks).map(([name, kind]) => ({
        name,
        kind,
        stateObserved: true,
        ...(kind === 'inactive-control'
          ? { status: 'not-applicable', reason: 'Disabled control' }
          : { status: 'pass', ratio: 5 }),
      })),
    })),
  )
  expect(validateColorStateEvidence({ cases }).status).toBe('pass')
  expect(validateColorStateEvidence({ cases: cases.slice(1) }).status).toBe(
    'not-measurable',
  )
  cases[0].rows[0].stateObserved = false
  expect(validateColorStateEvidence({ cases }).status).toBe('not-measurable')
  Object.assign(cases[0].rows[0], {
    stateObserved: true,
    ratio: 2.99,
    status: 'fail',
  })
  expect(validateColorStateEvidence({ cases }).status).toBe('fail')
})
