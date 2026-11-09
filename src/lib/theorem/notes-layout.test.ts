import { describe, expect, test } from 'bun:test'
import { TheoremError } from '@theoremharness/sdk'
import {
  START_LAYOUT,
  addSection,
  renameSection,
} from '@/components/notes/note-sections'
import {
  layoutOf,
  layoutWrite,
  parseStoredLayout,
  saveLayout,
} from './notes-layout'
import type { StoredLayout } from './notes-layout'

const stored = (revision: number, layout = START_LAYOUT): StoredLayout => ({
  layout,
  revision,
})

const stale = (current: StoredLayout) =>
  new TheoremError({
    message: 'PUT answered 409',
    statusCode: 409,
    body: { code: 'stale_layout', ...current },
  })

describe('layoutOf', () => {
  test('an account that never saved one starts with the three sections', () => {
    expect(layoutOf({ layout: null, revision: 0 })).toBe(START_LAYOUT)
  })
})

describe('parseStoredLayout', () => {
  test('reads what Theorem answers', () => {
    expect(
      parseStoredLayout({ schema: 'theorem-document/2', ...stored(3) }),
    ).toEqual(stored(3))
  })

  test('refuses a layout with no sections', () => {
    expect(() =>
      parseStoredLayout({
        layout: { sections: [], placed: {} },
        revision: 1,
      }),
    ).toThrow()
  })

  test('drops a placement whose key is no row', () => {
    const read = parseStoredLayout({
      layout: { ...START_LAYOUT, placed: { 'note:doc:1': 'notes', x: 'notes' } },
      revision: 1,
    })
    expect(read.layout?.placed).toEqual({ 'note:doc:1': 'notes' })
  })
})

test('layoutWrite puts the whole layout at the revision it was read at', () => {
  const write = layoutWrite(START_LAYOUT, 4, {
    'X-CSRF-Token': 't',
    'Idempotency-Key': 'k',
  })
  expect(write.path).toBe('/api/documents/v2/layouts/notes')
  expect(write.init.method).toBe('PUT')
  expect(write.init.headers['If-Match']).toBe('4')
  expect(write.init.body).toEqual({
    schema: 'theorem-document/2',
    idempotencyKey: 'k',
    layout: START_LAYOUT,
  })
})

describe('saveLayout', () => {
  const rename = (l: typeof START_LAYOUT) => renameSection(l, 'notes', 'Pages')

  test('writes the change over the layout it has', async () => {
    const puts: [string, number][] = []
    const saved = await saveLayout(rename, stored(2), (layout, revision) => {
      puts.push([layout.sections[1]?.name ?? '', revision])
      return Promise.resolve(stored(revision + 1, layout))
    })
    expect(puts).toEqual([['Pages', 2]])
    expect(saved.revision).toBe(3)
  })

  test('when another device saved first, makes the change again over theirs', async () => {
    const theirs = stored(5, addSection(START_LAYOUT, 'sec:theirs'))
    const puts: number[] = []
    const saved = await saveLayout(rename, stored(2), (layout, revision) => {
      puts.push(revision)
      return revision === 2
        ? Promise.reject(stale(theirs))
        : Promise.resolve(stored(revision + 1, layout))
    })
    expect(puts).toEqual([2, 5])
    expect(saved.layout?.sections.map((s) => s.name)).toEqual([
      'Folders',
      'Pages',
      'Agents',
      'New section',
    ])
  })

  test('gives up after three stale tries', async () => {
    let tries = 0
    const attempt = saveLayout(rename, stored(1), () => {
      tries += 1
      return Promise.reject(stale(stored(tries + 1)))
    })
    expect(attempt).rejects.toBeInstanceOf(TheoremError)
    await attempt.catch(() => undefined)
    expect(tries).toBe(3)
  })

  test('any other failure is not retried', async () => {
    let tries = 0
    const attempt = saveLayout(rename, stored(1), () => {
      tries += 1
      return Promise.reject(new Error('offline'))
    })
    expect(attempt).rejects.toThrow('offline')
    await attempt.catch(() => undefined)
    expect(tries).toBe(1)
  })
})
