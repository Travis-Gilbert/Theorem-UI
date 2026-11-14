import { describe, expect, test } from 'bun:test'
import { noteBody, notePath, noteTitle } from './note-model'

describe('noteTitle', () => {
  test('keeps an ordinary name and trims it', () => {
    expect(noteTitle('  Mott proposal  ')).toBe('Mott proposal')
  })
  test('path separators, colons and control characters become dashes', () => {
    expect(noteTitle('a/b\\c:d\te')).toBe('a-b-c-d-e')
  })
  test('nothing usable is Untitled', () => {
    expect(noteTitle('   ')).toBe('Untitled')
  })
})

describe('note path and body', () => {
  test('a note lives in Notes and is Markdown', () => {
    expect(notePath('Mott proposal')).toBe('Notes/Mott proposal.md')
  })
  test('the body is the title as the first heading', () => {
    expect(noteBody('Mott proposal')).toBe('# Mott proposal\n')
  })
})
