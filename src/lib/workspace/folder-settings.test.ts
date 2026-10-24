import { describe, expect, test } from 'bun:test'
import {
  attachmentFolder,
  dailyNotePath,
  fillTemplate,
} from './folder-settings'

describe('attachmentFolder', () => {
  test("reads the setting as Obsidian's default location for attachments", () => {
    expect(attachmentFolder('/', 'notes/a.md')).toBe('')
    expect(attachmentFolder('./', 'notes/a.md')).toBe('notes')
    expect(attachmentFolder('./', 'a.md')).toBe('')
    expect(attachmentFolder('./assets', 'notes/a.md')).toBe('notes/assets')
    expect(attachmentFolder('Attachments', 'notes/a.md')).toBe('Attachments')
    expect(attachmentFolder('/Media/img/', 'notes/a.md')).toBe('Media/img')
  })

  test('never leaves the folder', () => {
    expect(attachmentFolder('../..', 'notes/a.md')).toBe('')
    expect(attachmentFolder('./../../x', 'notes/a.md')).toBe('x')
  })
})

describe('daily notes', () => {
  const date = new Date(2026, 9, 23, 9, 5)

  test('are named for the day, in their folder', () => {
    expect(dailyNotePath('', date)).toBe('2026-10-23.md')
    expect(dailyNotePath('Journal/', date)).toBe('Journal/2026-10-23.md')
  })

  test("fill a template's date, time and title", () => {
    expect(
      fillTemplate('# {{title}}\n{{date}} at {{ time }}, {{other}}', {
        title: '2026-10-23',
        date,
      }),
    ).toBe('# 2026-10-23\n2026-10-23 at 09:05, {{other}}')
  })
})
