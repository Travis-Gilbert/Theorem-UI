// SOURCING: bun:test over what the chat says of a program part
// (program-part.tsx).
import { describe, expect, test } from 'bun:test'
import { programSummary } from './program-part'

const TS = 'const found = tool("lookup", { q: "alder" })\nfound.length\n'

describe('a program part in the chat', () => {
  test('a program the model wrote is named with its language and size', () => {
    expect(
      programSummary(
        { source: TS, language: 'typescript', authored: true },
        false,
      ),
    ).toEqual({
      source: TS,
      language: 'TypeScript',
      shiki: 'typescript',
      lines: 2,
      writing: false,
      cut: false,
    })
  })

  test('a program with no language named is the Python the agent writes', () => {
    const summary = programSummary(
      { source: 'value(1)', authored: true },
      false,
    )
    expect(summary?.language).toBe('Python')
    expect(summary?.shiki).toBe('python')
    expect(
      programSummary(
        { source: 'value(1)', language: 'monty', authored: true },
        false,
      )?.language,
    ).toBe('Python')
  })

  test('tool calls recorded as a program are not drawn as one', () => {
    expect(programSummary({ source: 'lookup(q="a")' }, false)).toBeNull()
    expect(
      programSummary({ source: 'lookup(q="a")', authored: false }, false),
    ).toBeNull()
  })

  test('a part with nothing in it draws nothing', () => {
    expect(programSummary({ source: '  \n', authored: true }, false)).toBeNull()
    expect(programSummary(null, false)).toBeNull()
    expect(programSummary('source', false)).toBeNull()
  })

  test('a program is being written only while its turn runs', () => {
    const arriving = { source: TS, authored: true, streaming: true }
    expect(programSummary(arriving, true)?.writing).toBe(true)
    // A turn that ended mid-program is not still writing it.
    expect(programSummary(arriving, false)?.writing).toBe(false)
  })

  test('a program cut where it was sent says so', () => {
    expect(
      programSummary({ source: TS, authored: true, truncated: true }, false)
        ?.cut,
    ).toBe(true)
  })
})
