import { describe, expect, test } from 'bun:test'
import { NOTE_SECTIONS, renameSection, sectionName } from './note-sections'

describe('sectionName', () => {
  test('each section starts with its own name', () => {
    expect(NOTE_SECTIONS.map((section) => sectionName(section, {}))).toEqual([
      'Folders',
      'Notes',
      'Agents',
    ])
  })

  test('a name the person gave wins', () => {
    expect(sectionName('notes', { notes: 'Loose pages' })).toBe('Loose pages')
  })
})

describe('renameSection', () => {
  test('keeps what the person typed, trimmed', () => {
    expect(renameSection({}, 'folders', '  Projects ')).toEqual({
      folders: 'Projects',
    })
  })

  test('an empty name gives the section its own name back', () => {
    expect(renameSection({ folders: 'Projects' }, 'folders', '   ')).toEqual({})
  })

  test('typing the starting name back stores nothing', () => {
    expect(renameSection({ agents: 'Bots' }, 'agents', 'Agents')).toEqual({})
  })

  test('leaves the other sections alone', () => {
    expect(
      renameSection({ notes: 'Pages', agents: 'Bots' }, 'notes', 'Sheets'),
    ).toEqual({ notes: 'Sheets', agents: 'Bots' })
  })
})
