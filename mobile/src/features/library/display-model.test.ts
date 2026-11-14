import { describe, expect, test } from 'bun:test'
import {
  type Display,
  DEFAULT_DISPLAY,
  dayGroup,
  groupItems,
  isDefaultDisplay,
  metaFor,
  orderItems,
  parseDisplay,
} from './display-model'
import type { LibraryItem } from './model'

const NOW = new Date(2026, 10, 14, 15, 0).getTime()
const day = (daysAgo: number) => new Date(2026, 10, 14 - daysAgo, 9, 0).getTime()

const item = (path: string, over: Partial<LibraryItem> = {}): LibraryItem => ({
  path,
  title: path.replace(/\.\w+$/, '').split('/').pop() ?? path,
  type: 'note',
  label: 'Note',
  folder: path.includes('/') ? path.split('/')[0] : undefined,
  modifiedMs: day(0),
  readOnly: false,
  size: 1,
  ...over,
})

describe('dayGroup', () => {
  test('counts calendar days, not 24-hour spans', () => {
    expect(dayGroup(day(0), NOW)).toBe('Today')
    expect(dayGroup(day(1), NOW)).toBe('Yesterday')
    expect(dayGroup(day(5), NOW)).toBe('Previous 7 days')
    expect(dayGroup(day(30), NOW)).toBe('Earlier')
  })
})

describe('orderItems', () => {
  const items = [item('b.md', { modifiedMs: day(2) }), item('a.md', { modifiedMs: day(0) }), item('C.md', { modifiedMs: day(1) })]
  test('recent puts the newest first', () => {
    expect(orderItems(items, 'recent').map((entry) => entry.path)).toEqual(['a.md', 'C.md', 'b.md'])
  })
  test('title ignores case', () => {
    expect(orderItems(items, 'title').map((entry) => entry.path)).toEqual(['a.md', 'b.md', 'C.md'])
  })
  test('does not change the list it was given', () => {
    orderItems(items, 'title')
    expect(items[0]?.path).toBe('b.md')
  })
})

describe('groupItems', () => {
  const items = [
    item('proj/a.md', { modifiedMs: day(0) }),
    item('proj/b.pdf', { type: 'pdf', label: 'PDF', modifiedMs: day(9) }),
    item('root.md', { modifiedMs: day(1) }),
  ]
  test('by type, groups are alphabetical', () => {
    expect(groupItems(items, 'type', 'recent', NOW).map((group) => group.title)).toEqual(['Note', 'PDF'])
  })
  test('by folder, a file at the root has its own group', () => {
    const groups = groupItems(items, 'folder', 'recent', NOW)
    expect(groups.map((group) => group.title)).toEqual(['No folder', 'proj'])
    expect(groups[1]?.items).toHaveLength(2)
  })
  test('by day, groups run from today back', () => {
    expect(groupItems(items, 'day', 'title', NOW).map((group) => group.title)).toEqual(['Today', 'Yesterday', 'Earlier'])
  })
  test('items inside a group follow the ordering', () => {
    const notes = groupItems(items, 'type', 'title', NOW)[0]
    expect(notes?.items.map((entry) => entry.title)).toEqual(['a', 'root'])
  })
})

describe('parseDisplay', () => {
  test('nothing stored is the default', () => {
    expect(parseDisplay(undefined)).toEqual(DEFAULT_DISPLAY)
    expect(isDefaultDisplay(parseDisplay(undefined))).toBe(true)
  })
  test('keeps a stored choice', () => {
    const stored: Display = { grouping: 'type', ordering: 'title', show: { excerpt: false, type: true, folder: true, time: false } }
    expect(parseDisplay(JSON.stringify(stored))).toEqual(stored)
  })
  test('a property added later falls back to its default', () => {
    const stored = { grouping: 'day', ordering: 'recent', show: { excerpt: false } }
    expect(parseDisplay(JSON.stringify(stored)).show).toEqual({ ...DEFAULT_DISPLAY.show, excerpt: false })
  })
  test('an unknown grouping, bad JSON and a missing show are the default', () => {
    expect(parseDisplay(JSON.stringify({ grouping: 'colour', ordering: 'recent', show: {} }))).toEqual(DEFAULT_DISPLAY)
    expect(parseDisplay('{nope')).toEqual(DEFAULT_DISPLAY)
    expect(parseDisplay(JSON.stringify({ grouping: 'type', ordering: 'recent' }))).toEqual(DEFAULT_DISPLAY)
  })
})

describe('metaFor', () => {
  const entry = item('proj/a.md')
  test('joins what is on', () => {
    expect(metaFor(entry, '2h', DEFAULT_DISPLAY.show)).toBe('Note · proj · 2h')
  })
  test('leaves out what is off, and the folder where it is already shown', () => {
    expect(metaFor(entry, '2h', { ...DEFAULT_DISPLAY.show, type: false }, false)).toBe('2h')
    expect(metaFor(entry, '2h', { excerpt: true, type: false, folder: false, time: false })).toBe('')
  })
})
