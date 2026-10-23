import { describe, expect, test } from 'bun:test'
import { AgentBlockError, agentInputs, agentReads, parseAgent } from './agent'

describe('agent blocks', () => {
  test('a body names its prompt, inputs, trigger and output', () => {
    const spec = parseAgent(`prompt: Summarize the week.
inputs: ["#streak", Data/habits.csv]
trigger: { schedule: "0 18 * * 5" }
output: Reviews/Weekly.md
`)
    expect(spec).toEqual({
      prompt: 'Summarize the week.',
      inputs: ['#streak', 'Data/habits.csv'],
      trigger: { schedule: '0 18 * * 5' },
      output: 'Reviews/Weekly.md',
    })
    expect(agentInputs(spec)).toEqual(['streak'])
    expect(agentReads(spec)).toEqual(['Data/habits.csv'])
    expect(parseAgent('prompt: Tidy up.').trigger).toBe('manual')
  })

  test('a body that is not an agent says what is wrong', () => {
    expect(() => parseAgent('prompt: [')).toThrow(AgentBlockError)
    expect(() => parseAgent('inputs: []')).toThrow(/prompt/)
    expect(() => parseAgent('prompt: x\nmodel: big')).toThrow(/model/)
  })
})
