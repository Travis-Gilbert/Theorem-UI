// SOURCING: none — pure logic, no upstream component applies
import { afterEach, expect, test } from 'bun:test'
import {
  DRAFT,
  composed,
  generationTurnOptions,
  readGeneration,
  useGenerationDefaults,
  useGenerationOverrides,
} from './generation'

afterEach(() => {
  useGenerationDefaults.setState({ defaults: {}, onServer: undefined })
  useGenerationOverrides.setState({ byThread: {} })
})

test('a turn carries only the fields that are set', () => {
  expect(generationTurnOptions('t1')).toEqual({})
  useGenerationDefaults.getState().change({ responseDetail: 'concise', maxOutputTokens: undefined })
  expect(generationTurnOptions('t1')).toEqual({ responseDetail: 'concise' })
})

test('a conversation override sits over the account defaults, field by field', () => {
  useGenerationDefaults.getState().change({
    responseDetail: 'balanced',
    effort: 'low',
    runBudget: { maxOutputTokens: 60_000, maxSteps: 40 },
  })
  useGenerationOverrides.getState().change('t1', { effort: 'high', runBudget: { maxSteps: 10 } })
  expect(generationTurnOptions('t1')).toEqual({
    responseDetail: 'balanced',
    effort: 'high',
    runBudget: { maxOutputTokens: 60_000, maxSteps: 10 },
  })
  // Another conversation still runs on the defaults.
  expect(generationTurnOptions('t2')).toEqual({
    responseDetail: 'balanced',
    effort: 'low',
    runBudget: { maxOutputTokens: 60_000, maxSteps: 40 },
  })
})

test('composing never lets an override that says nothing erase a default', () => {
  expect(composed({ effort: 'low' }, { effort: undefined, maxOutputTokens: 800 })).toEqual({
    effort: 'low',
    maxOutputTokens: 800,
  })
  expect(composed({}, { runBudget: {} })).toEqual({})
})

test('clearing the last field of an override removes the override', () => {
  const { change, reset } = useGenerationOverrides.getState()
  change('t1', { effort: 'high' })
  change('t1', { effort: undefined })
  expect(useGenerationOverrides.getState().byThread).toEqual({})
  change('t1', { maxOutputTokens: 100 })
  reset('t1')
  expect(useGenerationOverrides.getState().byThread).toEqual({})
})

test('a new conversation takes its draft override onto the thread it becomes', () => {
  const { change, adopt } = useGenerationOverrides.getState()
  change(DRAFT, { responseDetail: 'thorough' })
  adopt('t9')
  expect(useGenerationOverrides.getState().byThread).toEqual({ t9: { responseDetail: 'thorough' } })
  expect(generationTurnOptions('t9')).toEqual({ responseDetail: 'thorough' })
  // With no draft, adopting changes nothing.
  adopt('t10')
  expect(useGenerationOverrides.getState().byThread).toEqual({ t9: { responseDetail: 'thorough' } })
})

test('a server value outside the contract reads as nothing rather than as a setting', () => {
  expect(readGeneration({ responseDetail: 'thorough', maxOutputTokens: 4000 })).toEqual({
    responseDetail: 'thorough',
    maxOutputTokens: 4000,
  })
  expect(readGeneration({ responseDetail: 'verbose' })).toBeUndefined()
  expect(readGeneration({ maxOutputTokens: -5 })).toBeUndefined()
  expect(readGeneration(undefined)).toBeUndefined()
})
