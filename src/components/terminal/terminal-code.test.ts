import { expect, test } from 'bun:test'
import {
  highlightLines,
  OUTPUT_LINES,
  proseAndCode,
  toolOutput,
} from './terminal-code'

test('an answer splits into its prose and its highlighted code, in order', () => {
  const parts = proseAndCode(
    'Change the guard:\n\n```ts\nconst ready = count > 0\n```\n\nThen rebuild.',
  )
  expect(parts.map((p) => p.type)).toEqual(['text', 'code', 'text'])
  expect(parts[0]).toEqual({ type: 'text', text: 'Change the guard:\n\n' })
  expect(parts[1]).toEqual({
    type: 'code',
    lang: 'ts',
    lines: [
      [
        { t: 'const', c: 'keyword' },
        { t: ' ready = count > ' },
        { t: '0', c: 'number' },
      ],
    ],
  })
  expect(parts[2]).toEqual({ type: 'text', text: '\n\nThen rebuild.' })
})

test('a fence still streaming runs to the end of what has arrived', () => {
  const parts = proseAndCode('Here:\n\n```rust\nfn main() {\n')
  expect(parts.at(-1)).toMatchObject({ type: 'code', lang: 'rust' })
  const code = parts.at(-1)
  expect(code?.type === 'code' && code.lines[0]?.[0]).toEqual({
    t: 'fn',
    c: 'keyword',
  })
})

test('a diff marks what it adds and removes; an unknown language is plain', () => {
  const lines = highlightLines('@@ -1 +1 @@\n-old\n+new\n same', 'diff')
  expect(lines.map((line) => line.map((token) => token.c))).toEqual([
    ['meta'],
    ['deleted'],
    ['inserted'],
    [undefined],
  ])
  expect(highlightLines('one\ntwo', 'nonesuch')).toEqual([
    [{ t: 'one' }],
    [{ t: 'two' }],
  ])
})

test('prose without code, and code nested in a list, stay markdown', () => {
  expect(proseAndCode('Just **words**.')).toEqual([
    { type: 'text', text: 'Just **words**.' },
  ])
  const nested = '- step one\n\n  ```sh\n  make\n  ```\n'
  expect(proseAndCode(nested)).toEqual([{ type: 'text', text: nested }])
})

test('tool output keeps its first lines in the language of what it returned', () => {
  const read = toolOutput('fn main() {}\n', 'src/main.rs')
  expect(read?.lang).toBe('rust')
  expect(read?.lines[0]?.[0]).toEqual({ t: 'fn', c: 'keyword' })
  expect(
    toolOutput('--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b', 'x.ts')?.lang,
  ).toBe('diff')
  expect(toolOutput({ ok: true }, undefined)).toMatchObject({
    lang: 'json',
    more: 0,
  })
  expect(
    toolOutput({ content: [{ type: 'text', text: 'plain words' }] }, undefined),
  ).toEqual({ lang: '', lines: [[{ t: 'plain words' }]], more: 0 })
  const long = toolOutput(
    Array.from({ length: OUTPUT_LINES + 5 }, (_, i) => `line ${i}`).join('\n'),
    undefined,
  )
  expect(long?.lines).toHaveLength(OUTPUT_LINES)
  expect(long?.more).toBe(5)
  expect(toolOutput(undefined, undefined)).toBeUndefined()
})
