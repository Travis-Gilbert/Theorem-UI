// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import type { Theorem } from '@theoremharness/sdk'
import {
  classify,
  cleanSnippet,
  filesIn,
  foldersIn,
  folderOf,
  hitsToItems,
  itemsOf,
  metaLine,
  ofFilter,
  titleFromPath,
  togglePath,
  pushRecent,
  toItem,
} from './model'

const entry = (path: string, overrides: Partial<Theorem.FilesEntry> = {}): Theorem.FilesEntry =>
  ({
    backing: 'agentfs',
    entryId: path,
    kind: 'file',
    mtimeMs: 1_000,
    path,
    placed: true,
    readOnly: false,
    size: 10,
    ...overrides,
  }) as Theorem.FilesEntry

const document = (kind: string, origin: 'user_authored' | 'agent_encoded' = 'user_authored') =>
  ({
    documentId: 'note:1',
    documentKind: kind,
    collectionIds: [],
    revision: { position: 1, contentDigest: 'd' },
    origin: { kind: origin, actorId: 'a', originSurface: 's' },
  }) as unknown as Theorem.FilesDocumentRef

describe('classify', () => {
  test('an authored document is a note', () => {
    expect(classify(entry('A/n.md', { backing: 'document', document: document('authored') }))).toEqual({ type: 'note', label: 'Note' })
  })
  test('a generated app is an app', () => {
    expect(classify(entry('A/app', { backing: 'document', document: document('theorem.app') }))).toEqual({ type: 'generated', label: 'App' })
  })
  test("an agent's document is generated", () => {
    expect(classify(entry('A/n.md', { backing: 'document', document: document('authored', 'agent_encoded') })).type).toBe('generated')
  })
  test('a PDF file', () => expect(classify(entry('R/Paper.PDF'))).toEqual({ type: 'pdf', label: 'PDF' }))
  test('a saved page file', () => expect(classify(entry('S/a.html'))).toEqual({ type: 'page', label: 'Saved page' }))
  test('a plan is neither a note nor a file', () => expect(classify(entry('P/x', { backing: 'plan' }))).toEqual({ type: 'other', label: 'Plan' }))
  test('an unknown file', () => expect(classify(entry('a/b.png'))).toEqual({ type: 'other', label: 'File' }))
})

describe('paths', () => {
  test('title drops folders and the extension', () => expect(titleFromPath('Mott proposal/Budget outline.md')).toBe('Budget outline'))
  test('folder is the top-level folder', () => {
    expect(folderOf('Mott proposal/sub/x.md')).toBe('Mott proposal')
    expect(folderOf('x.md')).toBeUndefined()
  })
})

describe('folders', () => {
  const entries = [
    entry('A', { kind: 'directory' }),
    entry('A/B', { kind: 'directory' }),
    entry('A/x.md'),
    entry('A/B/y.md'),
    entry('C', { kind: 'directory' }),
    entry('z.md'),
  ]
  const items = itemsOf(entries)
  test('root folders', () => expect(foldersIn(entries)).toEqual(['A', 'C']))
  test('nested folders', () => expect(foldersIn(entries, 'A')).toEqual(['A/B']))
  test('files directly in a folder', () => expect(filesIn(items, 'A').map((item) => item.path)).toEqual(['A/x.md']))
  test('directories are not items', () => expect(items.map((item) => item.path)).toEqual(['A/x.md', 'A/B/y.md', 'z.md']))
})

describe('filter', () => {
  const items = [toItem(entry('a.pdf')), toItem(entry('b.html')), toItem(entry('c.md'))]
  test('all keeps everything', () => expect(ofFilter(items, 'all')).toHaveLength(3))
  test('pdf keeps PDFs', () => expect(ofFilter(items, 'pdf').map((item) => item.title)).toEqual(['a']))
})

describe('search hits', () => {
  test('markup and the repeated title are removed', () => {
    expect(cleanSnippet('# Three <mark>examples</mark>  The first example hangs works', 'Three examples')).toBe('The first example hangs works')
  })
  test('a hit takes its type and time from the entry', () => {
    const items = itemsOf([entry('Mott/Three examples.md', { backing: 'document', document: document('authored'), mtimeMs: 5 })])
    const [hit] = hitsToItems([{ path: 'Mott/Three examples.md', score: 1, snippet: 'See <mark>x</mark>', title: 'Three examples' }], items)
    expect(hit).toMatchObject({ type: 'note', modifiedMs: 5, excerpt: 'See x' })
  })
  test('a hit with no entry is dropped', () => {
    expect(hitsToItems([{ path: 'gone.md', score: 1, snippet: '', title: 'gone' }], [])).toEqual([])
  })
})

describe('pins and meta', () => {
  test('toggle adds first, then removes', () => {
    expect(togglePath(['b'], 'a')).toEqual(['a', 'b'])
    expect(togglePath(['a', 'b'], 'a')).toEqual(['b'])
  })
  test('the meta line names type, folder and time', () => {
    expect(metaLine(toItem(entry('Mott/x.pdf')), '12 minutes ago')).toBe('PDF · Mott · 12 minutes ago')
    expect(metaLine(toItem(entry('x.pdf')), 'Just now')).toBe('PDF · Just now')
  })
})

describe('pushRecent', () => {
  test('puts the newest first and lists a path once', () => {
    expect(pushRecent(['b', 'a'], 'a')).toEqual(['a', 'b'])
    expect(pushRecent([], 'a')).toEqual(['a'])
  })
  test('keeps at most max', () => {
    expect(pushRecent(['c', 'b', 'a'], 'd', 3)).toEqual(['d', 'c', 'b'])
  })
})
