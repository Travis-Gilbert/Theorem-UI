// SOURCING: bun:test over what the chat says of a program part
// (program-part.tsx).
import { describe, expect, test } from 'bun:test'
import { programSummary } from './program-part'

const TS = 'const found = tool("lookup", { q: "alder" })\nfound.length\n'

describe('a program part in the chat', () => {
  test('a TypeScript program is named with its language and size', () => {
    expect(
      programSummary({ source: TS, language: 'typescript' }, false),
    ).toEqual({
      source: TS,
      language: 'TypeScript',
      shiki: 'typescript',
      lines: 2,
      writing: false,
      cut: false,
    })
  })

  test('a tool call written as a Python program is not drawn as one', () => {
    expect(
      programSummary(
        { source: 'value(lookup(q="a"))', language: 'monty' },
        false,
      ),
    ).toBeNull()
    // A part from before programs named their language was Python.
    expect(programSummary({ source: 'lookup(q="a")' }, false)).toBeNull()
  })

  test('a part with nothing in it draws nothing', () => {
    expect(
      programSummary({ source: '  \n', language: 'typescript' }, false),
    ).toBeNull()
    expect(programSummary(null, false)).toBeNull()
    expect(programSummary('source', false)).toBeNull()
  })

  test('a program is being written only while its turn runs', () => {
    const arriving = { source: TS, language: 'typescript', streaming: true }
    expect(programSummary(arriving, true)?.writing).toBe(true)
    // A turn that ended mid-program is not still writing it.
    expect(programSummary(arriving, false)?.writing).toBe(false)
  })

  test('a program cut where it was sent says so', () => {
    expect(
      programSummary(
        { source: TS, language: 'typescript', truncated: true },
        false,
      )?.cut,
    ).toBe(true)
  })
})
