import { beforeEach, describe, expect, test } from 'bun:test'
import { fakeWorkspace } from '../../../test/workspace'
import { newFolder, newNote, openOrCreate, openTodaysNote } from './notes'
import { useWorkspaceFileView } from './open'

const opened = () => useWorkspaceFileView.getState().file?.path

describe('note commands', () => {
  beforeEach(() => useWorkspaceFileView.setState({ file: undefined }))

  test('a new note or folder takes the first free Untitled name', async () => {
    const vault = fakeWorkspace({ 'docs/Untitled.md': '', 'Untitled/a.md': '' })
    expect(await newNote(vault.client, 'docs')).toBe('docs/Untitled 1.md')
    expect(vault.text('docs/Untitled 1.md')).toBe('')
    expect(await newNote(vault.client, '')).toBe('Untitled.md')
    expect(await newFolder(vault.client, '')).toBe('Untitled 1')
    expect(await newFolder(vault.client, '')).toBe('Untitled 2')
  })

  test('openOrCreate opens a note that exists as it is', async () => {
    const vault = fakeWorkspace({ 'a.md': 'kept' })
    await openOrCreate(vault.client, 'a.md', 'new')
    expect(vault.text('a.md')).toBe('kept')
    expect(opened()).toBe('a.md')

    await openOrCreate(vault.client, 'b.md', 'new')
    expect(vault.text('b.md')).toBe('new')
    expect(opened()).toBe('b.md')
  })

  test("today's note is made once, in its folder, from the template", async () => {
    const vault = fakeWorkspace({
      'Templates/Daily.md': '# {{title}}\nMade {{date}} at {{ time }}\n',
    })
    await vault.client.setSettings({
      attachments: './',
      dailyNotes: { folder: 'Journal', template: 'Templates/Daily' },
    })
    const now = new Date(2026, 9, 23, 9, 5)

    expect(await openTodaysNote(vault.client, now)).toBe(
      'Journal/2026-10-23.md',
    )
    expect(vault.text('Journal/2026-10-23.md')).toBe(
      '# 2026-10-23\nMade 2026-10-23 at 09:05\n',
    )
    expect(opened()).toBe('Journal/2026-10-23.md')

    // Later the same day it opens the note as it was left.
    await vault.client.write('Journal/2026-10-23.md', 'edited')
    await openTodaysNote(vault.client, now)
    expect(vault.text('Journal/2026-10-23.md')).toBe('edited')
  })

  test('a template that cannot be found leaves the new note empty', async () => {
    const vault = fakeWorkspace({})
    await vault.client.setSettings({
      attachments: './',
      dailyNotes: { folder: '', template: 'Templates/Missing' },
    })
    expect(await openTodaysNote(vault.client, new Date(2026, 0, 2))).toBe(
      '2026-01-02.md',
    )
    expect(vault.text('2026-01-02.md')).toBe('')
  })
})
