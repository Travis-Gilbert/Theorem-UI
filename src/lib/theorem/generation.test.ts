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
  useGenerationDefaults.setState({ defaults: {}, onServer: undefined, saved: undefined })
  useGenerationOverrides.setState({ byThread: {}, unsaved: {} })
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

test('defaults the account preferences hold are not repeated on a turn', () => {
  useGenerationDefaults.getState().change({ responseDetail: 'concise', effort: 'low' })
  useGenerationOverrides.getState().change('t1', { effort: 'high' })
  expect(generationTurnOptions('t1')).toEqual({ responseDetail: 'concise', effort: 'high' })
  // Theorem took the defaults: it reads them itself and names them as the account's.
  useGenerationDefaults.setState({
    onServer: true,
    saved: { responseDetail: 'concise', effort: 'low' },
  })
  expect(generationTurnOptions('t1')).toEqual({ effort: 'high' })
  // A Theorem that refused them is sent them with every turn.
  useGenerationDefaults.setState({ onServer: false, saved: undefined })
  expect(generationTurnOptions('t1')).toEqual({ responseDetail: 'concise', effort: 'high' })
})

test('a default changed since the save rode with the turns until the new value is confirmed', () => {
  useGenerationDefaults.setState({
    defaults: { effort: 'low' },
    onServer: true,
    saved: { effort: 'low' },
  })
  expect(generationTurnOptions('t1')).toEqual({})
  // The change is made; its save waits on the debounce and the network.
  useGenerationDefaults.getState().change({ effort: 'max' })
  expect(generationTurnOptions('t1')).toEqual({ effort: 'max' })
  // A confirmation of the older value does not settle the newer one.
  useGenerationDefaults.setState({ saved: { effort: 'low' } })
  expect(generationTurnOptions('t1')).toEqual({ effort: 'max' })
  useGenerationDefaults.setState({ saved: { effort: 'max' } })
  expect(generationTurnOptions('t1')).toEqual({})
})

test('an override goes with the turn only until its thread holds it', () => {
  const { change, markSaved } = useGenerationOverrides.getState()
  change('t1', { maxOutputTokens: 800 })
  expect(useGenerationOverrides.getState().unsaved).toEqual({ t1: true })
  // Saving an older value does not settle a newer one.
  markSaved('t1', { maxOutputTokens: 400 })
  expect(generationTurnOptions('t1')).toEqual({ maxOutputTokens: 800 })
  markSaved('t1', { maxOutputTokens: 800 })
  expect(useGenerationOverrides.getState().unsaved).toEqual({})
  expect(generationTurnOptions('t1')).toEqual({})
})

test('a draft that becomes a thread is waiting to be saved onto it', () => {
  const { change, adopt } = useGenerationOverrides.getState()
  change(DRAFT, { effort: 'max' })
  adopt('t3')
  expect(useGenerationOverrides.getState().unsaved).toEqual({ t3: true })
})

test('overrides kept before threads held them are all waiting to be saved', () => {
  const migrate = useGenerationOverrides.persist.getOptions().migrate!
  expect(migrate({ byThread: { t1: { effort: 'high' }, t2: { maxOutputTokens: 9 } } }, 0)).toEqual({
    byThread: { t1: { effort: 'high' }, t2: { maxOutputTokens: 9 } },
    unsaved: { t1: true, t2: true },
  })
  expect(migrate(undefined, 0)).toEqual({ byThread: {}, unsaved: {} })
})
