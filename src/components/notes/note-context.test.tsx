import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '../../../test/workspace'
import { noteKey } from '@/lib/theorem/notes'
import type { Note } from '@/lib/theorem/notes'
import { NoteEditor } from './note-editor'
import { NotePanel } from './note-panel'
import { useComposer } from '@/components/canvas/composer-state'

afterEach(() => {
  cleanup()
  useComposer.getState().close()
})

test('context-menu capture sees editor changes before the delayed Markdown listener', async () => {
  const note: Note = {
    documentId: 'note-immediate-context',
    title: 'Note',
    markdown: 'Saved.',
    savedMarkdown: 'Saved.',
    revision: { position: 17, contentDigest: 'digest' },
    canonical: undefined,
    editable: true,
    origin: {
      kind: 'user_authored',
      actorId: 'person:test',
      originSurface: 'test',
    },
    retired: false,
  }
  const { container, queryClient } = await render(<NoteEditor note={note} />)
  queryClient.setQueryData(noteKey(note.documentId), note)
  await waitFor(() => container.querySelector('.ProseMirror'))
  const editor = container.querySelector('.ProseMirror')!
  await act(async () => {
    editor.querySelector('p')!.textContent = 'Unsaved Saved.'
    editor.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: 'Unsaved ',
      }),
    )
    await Bun.sleep(10)
    expect(
      queryClient.getQueryData<Note>(noteKey(note.documentId))?.markdown,
    ).toBe('Saved.')
    editor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
  })
  expect(
    queryClient.getQueryData<Note>(noteKey(note.documentId))?.markdown,
  ).toContain('Unsaved Saved.')
  expect(
    queryClient.getQueryData<Note>(noteKey(note.documentId))?.savedMarkdown,
  ).toBe('Saved.')
})

test('NotePanel captures the synchronously flushed source rather than its prior render', async () => {
  const note: Note = {
    documentId: 'note-panel-context',
    title: 'Note',
    markdown: 'Saved.',
    savedMarkdown: 'Saved.',
    revision: { position: 17, contentDigest: 'digest' },
    canonical: undefined,
    editable: true,
    origin: {
      kind: 'user_authored',
      actorId: 'person:test',
      originSurface: 'test',
    },
    retired: false,
  }
  const { container, queryClient, root } = await render(<></>)
  queryClient.setQueryData(noteKey(note.documentId), note)
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <NotePanel documentId={note.documentId} />
      </QueryClientProvider>,
    ),
  )
  await waitFor(() => container.querySelector('.ProseMirror'))
  const editor = container.querySelector('.ProseMirror')!
  await act(async () => {
    editor.querySelector('p')!.textContent = 'Unsaved Saved.'
    editor.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: 'Unsaved ',
      }),
    )
    await Bun.sleep(10)
    const range = document.createRange()
    range.selectNodeContents(editor.querySelector('p')!)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    editor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
  })
  expect(useComposer.getState().request?.sources[0]).toMatchObject({
    markdown: 'Unsaved Saved.\n',
    savedMarkdown: 'Saved.',
    revision: { position: 17 },
  })
})
