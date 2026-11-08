import { describe, expect, test } from 'bun:test'
import type { ListedNote } from './note-order'
import { NOTE_ORDERS, needsEveryPage, sortNotes } from './note-order'

const note = (
  documentId: string,
  title: string,
  createdPosition: number,
  updatedPosition: number,
): ListedNote => ({
  documentId,
  title,
  source: 'authored',
  retired: false,
  opens: documentId,
  createdPosition,
  updatedPosition,
})

const ids = (notes: ListedNote[]) => notes.map((n) => n.documentId)

// Made a, b, c in that order; written in last c, then a, then b.
const notes = [
  note('doc:a', 'Garden plan', 1, 20),
  note('doc:b', 'apples', 2, 30),
  note('doc:c', 'Zinnias', 3, 10),
]

describe('sortNotes', () => {
  test('recently edited puts the last note written into first', () => {
    expect(ids(sortNotes(notes, 'edited'))).toEqual(['doc:b', 'doc:a', 'doc:c'])
  })

  test('date created puts the newest note first', () => {
    expect(ids(sortNotes(notes, 'created'))).toEqual([
      'doc:c',
      'doc:b',
      'doc:a',
    ])
  })

  test('A to Z reads titles the way a person does, ignoring case', () => {
    expect(ids(sortNotes(notes, 'title'))).toEqual(['doc:b', 'doc:a', 'doc:c'])
  })

  test('A to Z counts numbers as numbers', () => {
    const numbered = [
      note('doc:10', 'Day 10', 1, 1),
      note('doc:9', 'Day 9', 2, 2),
    ]
    expect(ids(sortNotes(numbered, 'title'))).toEqual(['doc:9', 'doc:10'])
  })

  test('notes that tie keep one order, whatever order they came in', () => {
    const twins = [note('doc:2', 'Same', 5, 5), note('doc:1', 'Same', 5, 5)]
    for (const order of NOTE_ORDERS.map((o) => o.order)) {
      expect(ids(sortNotes(twins, order))).toEqual(['doc:1', 'doc:2'])
      expect(ids(sortNotes([...twins].reverse(), order))).toEqual([
        'doc:1',
        'doc:2',
      ])
    }
  })

  test('leaves the list it was given alone', () => {
    const given = [...notes]
    sortNotes(given, 'title')
    expect(ids(given)).toEqual(['doc:a', 'doc:b', 'doc:c'])
  })
})

describe('needsEveryPage', () => {
  test('Theorem pages by last edit, so only that order can show a page at a time', () => {
    expect(needsEveryPage('edited')).toBe(false)
    expect(needsEveryPage('created')).toBe(true)
    expect(needsEveryPage('title')).toBe(true)
  })
})

test('the menu offers each order once, by name', () => {
  expect(NOTE_ORDERS.map((o) => o.label)).toEqual([
    'Recently edited',
    'Date created',
    'A to Z',
  ])
})
