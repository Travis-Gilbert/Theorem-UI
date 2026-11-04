// SOURCING: bun:test over what an ask sends, as the document screen calls it.
import { expect, test } from 'bun:test'
import { askReferences, blocksPart } from './passage'

test('a selection is named by the blocks it covers', () => {
  expect(blocksPart([{ type: 'paragraph', whole: true }])).toBe(
    'selected paragraph',
  )
  expect(blocksPart([{ type: 'heading', whole: true }])).toBe(
    'selected heading',
  )
  expect(blocksPart([{ type: 'paragraph', whole: false }])).toBe(
    'selected text',
  )
  expect(
    blocksPart([
      { type: 'paragraph', whole: true },
      { type: 'heading', whole: false },
    ]),
  ).toBe('selected passage')
})

test('an ask sends the passage and the note to quote from, under Home’s own id', () => {
  const note = {
    workspaceId: 'theorem:v1',
    path: 'Research notes.md',
    title: 'Research notes',
    text: 'Findings\n\nThe first paragraph.',
  }
  const resource = {
    kind: 'file',
    workspaceId: 'v1',
    path: 'Research notes.md',
  }
  expect(
    askReferences(note, {
      part: 'selected paragraph',
      text: 'The first paragraph.',
    }),
  ).toEqual([
    {
      location: { resource },
      excerpt: 'The first paragraph.',
      label: 'Research notes · selected paragraph',
    },
    {
      location: { resource },
      excerpt: 'Findings\n\nThe first paragraph.',
      label: 'Research notes',
    },
  ] as never)
})
