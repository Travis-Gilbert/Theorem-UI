import { expect, test } from 'bun:test'
import {
  diffLines,
  highlightLines,
  openOf,
  OUTPUT_LINES,
  proseAndCode,
  toolOutput,
} from './terminal-code'
import type { DiffLine } from './terminal-code'

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

test("TanStack's diff grammar classes whole lines; an unknown language is plain", () => {
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

const EDIT = [
  'diff --git a/src/parser.rs b/src/parser.rs',
  '--- a/src/parser.rs',
  '+++ b/src/parser.rs',
  '@@ -2,2 +2,2 @@ pub fn fields(line: &str) -> Vec<&str> {',
  "-    let trimmed = line.trim_end_matches(',');",
  "+    let trimmed = line.strip_suffix(',').unwrap_or(line);",
  "     trimmed.split(',').map(str::trim).collect()",
].join('\n')

const textOf = (line: DiffLine) => line.t.map((token) => token.t).join('')
const changedIn = (line: DiffLine) =>
  line.t.filter((token) => token.e).map((token) => token.t)

test('a diff keeps the syntax inside each line and marks it kept, removed or added', () => {
  const lines = diffLines(EDIT)
  expect(lines.map((line) => line.k)).toEqual([
    'file',
    'hunk',
    'del',
    'add',
    'ctx',
  ])
  expect(textOf(lines[0]!)).toBe('src/parser.rs')
  expect(textOf(lines[1]!)).toBe(
    '@@ -2,2 +2,2 @@ pub fn fields(line: &str) -> Vec<&str> {',
  )
  // The marker leaves the code; its column is the crate's to draw.
  expect(textOf(lines[2]!)).toBe(
    "    let trimmed = line.trim_end_matches(',');",
  )
  for (const line of lines.slice(2)) {
    expect(line.t.some((token) => token.c === 'function')).toBe(true)
  }
  expect(lines[2]!.t).toContainEqual({ t: 'let', c: 'keyword' })
  expect(lines[3]!.t).toContainEqual({ t: "','", c: 'string' })
})

test('a changed line marks the words that changed, not the ones it kept', () => {
  const [, , removed, added, kept] = diffLines(EDIT)
  expect(changedIn(removed!)).toEqual(['trim_end_matches'])
  expect(changedIn(added!).join('')).toBe('strip_suffix.unwrap_or(line)')
  expect(added!.t).toContainEqual({ t: 'strip_suffix', c: 'function', e: true })
  expect(changedIn(kept!)).toEqual([])
  // A line rewritten throughout reads as removed and added, word for word.
  const rewritten = diffLines('@@ -1 +1 @@\n-alpha beta\n+gamma delta', 'x.txt')
  expect(rewritten.flatMap(changedIn)).toEqual([])
})

test('a diff whose counts are off, or still arriving, still reads line by line', () => {
  for (const text of [
    '--- a/x.rs\n+++ b/x.rs\n@@ -1,1 +1,1 @@\n-let a = 1;\n+let a = 2;\n fn b() {}\n',
    '--- a/x.rs\n+++ b/x.rs\n@@ -1,4 +1,4 @@\n-let a = 1;\n+let a = 2;',
  ]) {
    const lines = diffLines(text)
    expect(lines.slice(0, 4).map((line) => line.k)).toEqual([
      'file',
      'hunk',
      'del',
      'add',
    ])
    expect(lines[2]!.t[0]).toEqual({ t: 'let', c: 'keyword' })
    expect(changedIn(lines[3]!)).toEqual(['2'])
  }
})

test("a diff's language comes from the file it names, else from the tool's path", () => {
  const hunkOnly = '@@ -1 +1 @@\n-let a = 1;\n+let a = 2;'
  expect(diffLines(hunkOnly, 'src/x.rs')[1]!.t[0]).toEqual({
    t: 'let',
    c: 'keyword',
  })
  expect(diffLines(hunkOnly)[1]!.t[0]).toEqual({ t: 'let a = ' })
  // The tool's row names its one file already.
  expect(diffLines(EDIT, 'src/parser.rs')[0]!.k).toBe('hunk')
})

test('an edit returns a diff the terminal draws line by line, its first lines kept', () => {
  const edit = toolOutput(EDIT, 'src/parser.rs')
  expect(edit).toMatchObject({ lang: 'diff', lines: [], more: 0 })
  expect(edit?.diff?.map((line) => line.k)).toEqual([
    'hunk',
    'del',
    'add',
    'ctx',
  ])
  const long = toolOutput(
    `@@ -1,${OUTPUT_LINES + 5} +1,0 @@\n` +
      Array.from({ length: OUTPUT_LINES + 5 }, (_, i) => `-line ${i}`).join(
        '\n',
      ),
    'x.txt',
  )
  expect(long?.diff).toHaveLength(OUTPUT_LINES)
  expect(long?.more).toBe(6)
})

test('a fenced diff in an answer is drawn as a diff', () => {
  const [, code] = proseAndCode(`The change:\n\n\`\`\`diff\n${EDIT}\n\`\`\`\n`)
  expect(code).toMatchObject({ type: 'code', lang: 'diff', lines: [] })
  expect(code?.type === 'code' && code.diff?.map((line) => line.k)).toEqual([
    'file',
    'hunk',
    'del',
    'add',
    'ctx',
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

test('a tool row opens its file at the lines it changed, else the lines it read', () => {
  const edit =
    '--- a/src/parser.rs\n+++ b/src/parser.rs\n@@ -2,3 +2,4 @@\n-a\n+b\n+c\n d\n e'
  expect(openOf('src/parser.rs', {}, edit)).toEqual({
    path: 'src/parser.rs',
    start: 2,
    end: 5,
  })
  expect(
    openOf(
      'src/parser.rs',
      { path: 'src/parser.rs', offset: 10, limit: 5 },
      'fn x',
    ),
  ).toEqual({ path: 'src/parser.rs', start: 10, end: 14 })
  expect(openOf('a.ts', { start_line: 3, end_line: 7 }, undefined)).toEqual({
    path: 'a.ts',
    start: 3,
    end: 7,
  })
  expect(openOf('a.ts', {}, 'contents')).toEqual({
    path: 'a.ts',
    start: undefined,
    end: undefined,
  })
  expect(openOf(undefined, { query: 'x' }, 'found')).toBeUndefined()
  // A hunk whose header miscounts its lines is not trusted; the asked range is.
  expect(
    openOf(
      'a.ts',
      { start_line: 8 },
      '--- a/a.ts\n+++ b/a.ts\n@@ -1,3 +1,3 @@\n-a\n+b',
    ),
  ).toEqual({ path: 'a.ts', start: 8, end: 8 })
})
