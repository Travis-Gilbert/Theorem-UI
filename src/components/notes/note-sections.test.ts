import { describe, expect, test } from 'bun:test'
import {
  AGENTS_ITEM,
  START_LAYOUT,
  addSection,
  deleteSection,
  folderItem,
  groupBySection,
  isSectionItem,
  moveSection,
  noteItem,
  placeItem,
  renameSection,
  sectionOf,
  toggleSection,
} from './note-sections'
import type { SectionLayout } from './note-sections'

const names = (layout: SectionLayout) => layout.sections.map((s) => s.name)
const ids = (layout: SectionLayout) => layout.sections.map((s) => s.id)

describe('the starting sections', () => {
  test('are the folders, the notes and what agents wrote', () => {
    expect(names(START_LAYOUT)).toEqual(['Folders', 'Notes', 'Agents'])
  })

  test('each kind of row starts in its own section', () => {
    expect(sectionOf(START_LAYOUT, folderItem('col:1'))).toBe('folders')
    expect(sectionOf(START_LAYOUT, noteItem('doc:1'))).toBe('notes')
    expect(sectionOf(START_LAYOUT, AGENTS_ITEM)).toBe('agents')
  })
})

describe('addSection', () => {
  test('puts the new section after the one the person pointed at', () => {
    const layout = addSection(START_LAYOUT, 'sec:new', 'folders')
    expect(ids(layout)).toEqual(['folders', 'sec:new', 'notes', 'agents'])
    expect(layout.sections[1]).toEqual({
      id: 'sec:new',
      name: 'New section',
      collapsed: false,
    })
  })

  test('goes last when no section was pointed at', () => {
    expect(ids(addSection(START_LAYOUT, 'sec:new')).at(-1)).toBe('sec:new')
  })

  test('adding the same section twice adds it once', () => {
    const once = addSection(START_LAYOUT, 'sec:new')
    expect(addSection(once, 'sec:new')).toBe(once)
  })
})

describe('renameSection', () => {
  test('keeps what the person typed, trimmed', () => {
    expect(
      names(renameSection(START_LAYOUT, 'notes', '  Loose pages ')),
    ).toEqual(['Folders', 'Loose pages', 'Agents'])
  })

  test('an empty name keeps the one it had', () => {
    expect(renameSection(START_LAYOUT, 'notes', '   ')).toBe(START_LAYOUT)
  })
})

describe('deleteSection', () => {
  test('takes the section out of the list', () => {
    expect(ids(deleteSection(START_LAYOUT, 'notes'))).toEqual([
      'folders',
      'agents',
    ])
  })

  test('what was in it goes back to its own section', () => {
    const made = addSection(START_LAYOUT, 'sec:work')
    const filed = placeItem(made, noteItem('doc:1'), 'sec:work')
    expect(sectionOf(filed, noteItem('doc:1'))).toBe('sec:work')
    expect(sectionOf(deleteSection(filed, 'sec:work'), noteItem('doc:1'))).toBe(
      'notes',
    )
  })

  test('with its own section gone, a row goes to the first section', () => {
    const layout = deleteSection(START_LAYOUT, 'notes')
    expect(sectionOf(layout, noteItem('doc:1'))).toBe('folders')
  })

  test('the last section stays', () => {
    const one = deleteSection(deleteSection(START_LAYOUT, 'notes'), 'agents')
    expect(deleteSection(one, 'folders')).toBe(one)
  })
})

describe('moveSection', () => {
  test('moves a section to where another one was', () => {
    expect(ids(moveSection(START_LAYOUT, 'agents', 'folders'))).toEqual([
      'agents',
      'folders',
      'notes',
    ])
    expect(ids(moveSection(START_LAYOUT, 'folders', 'notes'))).toEqual([
      'notes',
      'folders',
      'agents',
    ])
  })

  test('a section dropped on itself, or on nothing known, stays put', () => {
    expect(moveSection(START_LAYOUT, 'notes', 'notes')).toBe(START_LAYOUT)
    expect(moveSection(START_LAYOUT, 'notes', 'sec:gone')).toBe(START_LAYOUT)
  })
})

describe('placeItem', () => {
  test('puts a folder in another section', () => {
    const layout = placeItem(START_LAYOUT, folderItem('col:1'), 'agents')
    expect(sectionOf(layout, folderItem('col:1'))).toBe('agents')
    expect(sectionOf(layout, folderItem('col:2'))).toBe('folders')
  })

  test('a section that is not there leaves the row where it was', () => {
    expect(placeItem(START_LAYOUT, AGENTS_ITEM, 'sec:gone')).toBe(START_LAYOUT)
  })
})

describe('toggleSection', () => {
  test('folds a section away and opens it again', () => {
    const folded = toggleSection(START_LAYOUT, 'notes')
    expect(folded.sections[1]?.collapsed).toBe(true)
    expect(toggleSection(folded, 'notes').sections[1]?.collapsed).toBe(false)
    expect(folded.sections[0].collapsed).toBe(false)
  })
})

test('groupBySection lists each section with its rows, in the given order', () => {
  const layout = placeItem(
    addSection(START_LAYOUT, 'sec:work', 'folders'),
    noteItem('doc:2'),
    'sec:work',
  )
  const rows = ['doc:1', 'doc:2', 'doc:3'].map((id) => ({ id }))
  const grouped = groupBySection(layout, rows, (row) => noteItem(row.id))
  expect(grouped.get('sec:work')).toEqual([{ id: 'doc:2' }])
  expect(grouped.get('notes')).toEqual([{ id: 'doc:1' }, { id: 'doc:3' }])
  expect(grouped.get('folders')).toEqual([])
})

test('isSectionItem knows a row from anything else dragged', () => {
  expect(isSectionItem('note:doc:1')).toBe(true)
  expect(isSectionItem('folder:col:1')).toBe(true)
  expect(isSectionItem('agents')).toBe(true)
  expect(isSectionItem('section:notes')).toBe(false)
})
