// SOURCING: bun:test over what the row for an App check says (theorem-parts.tsx).
import { expect, test } from 'bun:test'
import { appCheckSummary } from './theorem-parts'

const answered = (result: Record<string, unknown>, outcome = 'applied') => ({
  operation: 'app.check',
  state: 'answered',
  receipt: { outcome, result },
})
const clean = { built: true, problems: [], omitted: 0, typesChecked: true }

test('a check that found nothing says so, and one in flight says it is being made', () => {
  expect(appCheckSummary(answered(clean), false)).toEqual({
    words: 'Checked the App: no problems',
    pending: false,
    wrong: false,
    reason: undefined,
  })
  expect(
    appCheckSummary({ operation: 'app.check', state: 'pending' }, true)?.words,
  ).toBe('Checking the App')
})

test('a type check that could not be made is not a clean check', () => {
  const summary = appCheckSummary(
    answered({
      ...clean,
      typesChecked: false,
      typeCheckError: 'The type checker could not start',
    }),
    false,
  )
  expect(summary).toEqual({
    words: 'Checked the App: its types could not be checked',
    pending: false,
    wrong: true,
    reason: 'The type checker could not start',
  })
})

test('problems are counted with the ones left out, and a failed build is named', () => {
  const two = answered({ ...clean, problems: [{}], omitted: 1 })
  expect(appCheckSummary(two, false)?.words).toBe('Checked the App: 2 problems')
  const unbuilt = answered({ ...clean, built: false, problems: [{}] })
  expect(appCheckSummary(unbuilt, false)).toMatchObject({
    words: 'The App does not build',
    wrong: true,
  })
})

test('a check that was not made says so, and another operation draws nothing', () => {
  expect(appCheckSummary(answered({}, 'failed'), false)).toMatchObject({
    words: 'The App was not checked',
    wrong: true,
  })
  expect(appCheckSummary({ operation: 'kit.move' }, false)).toBeNull()
})
