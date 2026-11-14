import { describe, expect, test } from 'bun:test'
import { addedDetail, reduceAdded, type Added } from './added-files'

describe('reduceAdded', () => {
  test('a started upload goes first and is uploading', () => {
    const list = reduceAdded([{ id: 'a', name: 'a.pdf', state: 'stored' }], { type: 'start', id: 'b', name: 'b.pdf' })
    expect(list.map((entry) => [entry.id, entry.state])).toEqual([['b', 'uploading'], ['a', 'stored']])
  })
  test('starting a file again replaces its earlier row', () => {
    const failed: Added[] = [{ id: 'a', name: 'a.pdf', state: 'failed', error: 'no' }]
    expect(reduceAdded(failed, { type: 'start', id: 'a', name: 'a.pdf' })).toEqual([{ id: 'a', name: 'a.pdf', state: 'uploading' }])
  })
  test('Theorem storing it, or refusing it, changes only that row', () => {
    const list: Added[] = [
      { id: 'a', name: 'a.pdf', state: 'uploading' },
      { id: 'b', name: 'b.pdf', state: 'uploading' },
    ]
    const stored = reduceAdded(list, { type: 'stored', id: 'a' })
    expect(stored.map((entry) => entry.state)).toEqual(['stored', 'uploading'])
    const failed = reduceAdded(stored, { type: 'failed', id: 'b', error: 'Too large' })
    expect(failed[1]).toEqual({ id: 'b', name: 'b.pdf', state: 'failed', error: 'Too large' })
  })
})

describe('addedDetail', () => {
  test('says only what is known', () => {
    expect(addedDetail({ id: 'a', name: 'a', state: 'uploading' })).toBe('Uploading')
    expect(addedDetail({ id: 'a', name: 'a', state: 'stored' })).toBe('Stored by Theorem')
    expect(addedDetail({ id: 'a', name: 'a', state: 'failed', error: 'Too large' })).toBe('Too large')
  })
})
