// SOURCING: none — pure logic, no upstream component applies
import { expect, test } from 'bun:test'
import {
  endsRun,
  firstRenderedAt,
  isStepDataPart,
  limitRows,
  isStreamingProse,
  latestRunFacts,
  noteFirstRender,
  readCompletion,
  readLimits,
  runFacts,
  spokenMs,
  stopNotice,
  textMeta,
  timingRows,
} from './run-parts'

// The shape Theorem publishes (docs/plans/front-response/CONTRACT.md, section 3, as built).
const limits = {
  maxOutputTokensPerCall: { value: 8000, source: 'request', clamped: false, requested: 8000 },
  modelMaxOutputTokens: 64_000,
  runBudget: {
    maxOutputTokens: 60_000,
    maxOutputTokensSource: 'conversation',
    usedOutputTokens: 59_000,
    maxSteps: 40,
    maxStepsSource: 'preference',
    usedSteps: 3,
  },
  effort: { requested: 'high', source: 'preference', effective: 'medium', reason: 'nearest' },
  responseDetail: { value: 'balanced', source: 'conversation' },
}
const notice = (stopReason: string, over: Record<string, unknown> = {}) => {
  const completion = readCompletion({ stopReason, limits, ...over })
  return completion && stopNotice(completion)
}

test('a normal end, a stop and a failure leave the footer empty', () => {
  expect(notice('end_turn')).toBeUndefined()
  expect(notice('cancelled')).toBeUndefined()
  expect(notice('error')).toBeUndefined()
  expect(notice('some_future_reason')).toBeUndefined()
})

test('a reply that reached its per-call limit explains it and offers to double it', () => {
  expect(notice('max_output_tokens')).toEqual({
    text: 'This reply reached its limit of 8,000 tokens for one step.',
    raise: { patch: { maxOutputTokens: 16_000 }, label: 'Raise to 16,000 tokens' },
  })
})

test('raising never goes past the model, and never offers what a setting cannot move', () => {
  const near = { maxOutputTokensPerCall: { value: 40_000, source: 'preference' } }
  expect(notice('max_output_tokens', { limits: { ...limits, ...near } })?.raise?.patch).toEqual({
    maxOutputTokens: 64_000,
  })
  const atModel = { maxOutputTokensPerCall: { value: 64_000, source: 'model' } }
  expect(notice('max_output_tokens', { limits: { ...limits, ...atModel } })?.raise).toBeUndefined()
  const context = { maxOutputTokensPerCall: { value: 5000, source: 'context' } }
  expect(notice('max_output_tokens', { limits: { ...limits, ...context } })?.raise).toBeUndefined()
  expect(notice('max_output_tokens', { limits: undefined })).toEqual({
    text: 'This reply reached its limit for one step.',
  })
})

test('a spent run budget offers to double the budget; the server gets the last word on wording', () => {
  expect(notice('run_budget')).toEqual({
    text: 'This run used its budget of 60,000 tokens.',
    raise: { patch: { runBudget: { maxOutputTokens: 120_000 } }, label: 'Raise to 120,000 tokens' },
  })
  expect(notice('run_budget', { detail: 'Out of budget.' })?.text).toBe('Out of budget.')
})

test('a step limit explains itself and offers to double the steps', () => {
  expect(notice('step_limit')).toEqual({
    text: 'This run reached its limit of 40 steps.',
    raise: { patch: { runBudget: { maxSteps: 80 } }, label: 'Raise to 80 steps' },
  })
  expect(notice('step_limit', { limits: undefined })).toEqual({ text: 'This run reached its limit on steps.' })
})

test('the limits rows say what each limit was and who set it', () => {
  expect(limitRows(readLimits({ limits })!)).toEqual([
    { label: 'Output per step', value: '8,000 tokens', note: 'set for this reply' },
    { label: 'Model maximum', value: '64,000 tokens' },
    { label: 'Run output', value: '59,000 of 60,000 tokens', note: 'set for this conversation' },
    { label: 'Run steps', value: '3 of 40 steps', note: 'your default' },
    { label: 'Reasoning effort', value: 'Medium', note: 'the nearest level this model lists to High' },
    { label: 'Response detail', value: 'Balanced', note: 'set for this conversation' },
  ])
})

test('a limit that was cut down says what was asked for', () => {
  const cut = {
    maxOutputTokensPerCall: { value: 64_000, source: 'model', clamped: true, requested: 200_000 },
  }
  expect(limitRows(readLimits({ limits: cut })!)).toEqual([
    {
      label: 'Output per step',
      value: '64,000 tokens',
      note: "the model's own maximum; 200,000 tokens was asked for",
    },
  ])
})

test('effort is reported as it ran: applied, not sent, or never asked for', () => {
  const row = (effort: Record<string, unknown>) =>
    limitRows(readLimits({ limits: { effort } })!).find((r) => r.label === 'Reasoning effort')
  expect(row({ requested: 'high', source: 'request', effective: 'high', reason: 'applied' })).toEqual({
    label: 'Reasoning effort',
    value: 'High',
    note: 'set for this reply',
  })
  expect(row({ requested: 'xhigh', source: 'preference', effective: null, reason: 'unsupported' })).toEqual({
    label: 'Reasoning effort',
    value: 'Not sent',
    note: 'this model takes no level; Extra high was asked for',
  })
  expect(row({ requested: null, effective: null, reason: 'unsupported' })).toBeUndefined()
  expect(row({ requested: null, effective: null, reason: 'not_requested' })).toBeUndefined()
})

test('a run with no budget of its own reports what it used so far', () => {
  const open = { runBudget: { maxOutputTokens: null, usedOutputTokens: 1234, maxSteps: 100, maxStepsSource: 'default', usedSteps: 2 } }
  expect(limitRows(readLimits({ limits: open })!)).toEqual([
    { label: 'Run output', value: '1,234 tokens so far, no cap' },
    { label: 'Run steps', value: '2 of 100 steps', note: "Theorem's default" },
  ])
})

test('a completion or limits part that is not what the contract says reads as nothing', () => {
  expect(readCompletion({ stopReason: 7 })).toBeUndefined()
  expect(readCompletion(undefined)).toBeUndefined()
  expect(readLimits({ limits: { maxOutputTokensPerCall: { value: 'many' } } })).toBeUndefined()
  expect(readLimits({})).toBeUndefined()
  expect(readLimits({ limits })).toMatchObject({ effort: { requested: 'high', effective: 'medium' } })
  // The detail is an object with its source; a bare string is not this contract.
  expect(readLimits({ limits: { responseDetail: 'balanced' } })).toBeUndefined()
})

test('a completion whose run was never accepted here still says why it stopped', () => {
  const cut = readCompletion({
    stopReason: 'cancelled',
    timing: { acceptedAtMs: null, firstProviderContentAtMs: null, firstPartPersistedAtMs: null, completedAtMs: 9 },
  })
  expect(cut?.stopReason).toBe('cancelled')
  expect(timingRows(cut!.timing!)).toEqual([])
})

test('text metadata is read from the provider metadata the adapter sets, and is empty without it', () => {
  expect(textMeta({ providerMetadata: { theorem: { purpose: 'commentary', segment: 1, status: 'running' } } })).toEqual({
    purpose: 'commentary',
    segment: 1,
    status: 'running',
  })
  expect(textMeta({})).toEqual({})
  expect(textMeta({ providerMetadata: { other: { purpose: 'commentary' } } })).toEqual({})
})

test('only the work between prose belongs to a step group', () => {
  expect(isStepDataPart({ type: 'data', name: 'theorem-progress' })).toBe(true)
  expect(isStepDataPart({ type: 'data', name: 'theorem-delegation' })).toBe(true)
  expect(isStepDataPart({ type: 'data', name: 'theorem-citation' })).toBe(false)
  expect(isStepDataPart({ type: 'data', name: 'theorem-completion' })).toBe(false)
  expect(isStepDataPart({ type: 'text' })).toBe(false)
})

test('a group ends the run unless something the reader counts follows it', () => {
  const content = [
    { type: 'data', name: 'theorem-limits' },
    { type: 'tool-call' },
    { type: 'data', name: 'theorem-completion' },
  ]
  expect(endsRun(content, [1])).toBe(true)
  expect(endsRun([...content.slice(0, 2), { type: 'text' }], [1])).toBe(false)
  expect(endsRun([{ type: 'tool-call' }, { type: 'data', name: 'theorem-citation' }], [0])).toBe(false)
})

test('the thinking line steps aside only while prose is being written', () => {
  const text = (status?: string) => ({ type: 'text', providerMetadata: status ? { theorem: { status } } : undefined })
  expect(isStreamingProse([{ type: 'tool-call' }, text('running')])).toBe(true)
  expect(isStreamingProse([text('complete')])).toBe(false)
  expect(isStreamingProse([text()])).toBe(false)
  expect(isStreamingProse([text('running'), { type: 'tool-call' }])).toBe(false)
  expect(isStreamingProse([])).toBe(false)
})

test('a run reports its limits from the completion once it has one, else from its limits part', () => {
  const live = [{ type: 'data', name: 'theorem-limits', data: { limits } }]
  expect(runFacts(live)).toEqual({ limits: readLimits({ limits }) })
  const done = [
    ...live,
    {
      type: 'data',
      name: 'theorem-completion',
      data: { stopReason: 'end_turn', limits: { ...limits, modelMaxOutputTokens: 1 }, timing: { acceptedAtMs: 10 } },
    },
  ]
  expect(runFacts(done).limits?.modelMaxOutputTokens).toBe(1)
  expect(runFacts(done).timing).toEqual({ acceptedAtMs: 10 })
  expect(runFacts([{ type: 'text' }])).toEqual({})
})

test('the newest assistant message answers for the conversation, with the run it was noted under', () => {
  const messages = [
    { role: 'assistant', content: [{ type: 'data', name: 'theorem-limits', data: { limits } }], metadata: { custom: { theoremRunId: 'old' } } },
    { role: 'user', content: [] },
    { role: 'assistant', content: [], metadata: { custom: { theoremRunId: 'new' } } },
  ]
  expect(latestRunFacts(messages)).toEqual({ runId: 'new' })
  expect(latestRunFacts([{ role: 'user', content: [] }])).toBeUndefined()
})

test('timing is five offsets from the moment the run was accepted, leaving out what was never recorded', () => {
  const timing = {
    acceptedAtMs: 1_000,
    firstProviderContentAtMs: 1_450,
    firstPartPersistedAtMs: 1_600,
    completedAtMs: 4_200,
  }
  expect(timingRows(timing, 1_700).map(({ label, ms }) => [label, ms])).toEqual([
    ['Accepted', 0],
    ['First content from the model', 450],
    ['First part saved', 600],
    ['First shown here', 700],
    ['Completed', 3_200],
  ])
  expect(timingRows({ acceptedAtMs: 1_000, completedAtMs: null }).map(({ label }) => label)).toEqual(['Accepted'])
  expect(spokenMs(450)).toBe('450 ms')
  expect(spokenMs(3_200)).toBe('3.2 s')
})

test('the first render of a run is noted once and the first note stands', () => {
  noteFirstRender('run-a', 100)
  noteFirstRender('run-a', 900)
  expect(firstRenderedAt('run-a')).toBe(100)
  expect(firstRenderedAt('run-b')).toBeUndefined()
  expect(firstRenderedAt(undefined)).toBeUndefined()
})
