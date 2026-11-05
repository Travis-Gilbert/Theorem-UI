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
      markable: true,
    },
    {
      location: { resource },
      excerpt: 'Findings\n\nThe first paragraph.',
      label: 'Research notes',
    },
  ] as never)
})

test('a document-backed note names its canonical revision and only quotes the selected passage', () => {
  const note = {
    workspaceId: 'theorem:vault',
    path: 'renamed.md',
    title: 'Local title',
    text: 'Unsaved whole note must not become canonical context',
  }
  expect(
    askReferences(
      note,
      { part: 'selected text', text: 'Selected passage' },
      {
        documentId: 'document-42',
        documentKind: 'authored',
        revision: { position: 17, contentDigest: 'hash' },
      },
    ),
  ).toEqual([
    {
      location: {
        resource: {
          kind: 'graph-object',
          objectId: 'document-42',
          objectType: 'authored',
        },
        revision: '17',
      },
      excerpt: 'Selected passage',
      label: 'Local title · selected text',
      markable: true,
    },
  ])
})

// Theorem measures each reference as JSON: 8 KiB for a saved note's, 256 KiB
// for one from a folder on the device. It refuses the whole ask over either.
const onTheWire = (reference: unknown) =>
  new TextEncoder().encode(JSON.stringify(reference)).length

const device = (text: string) => ({
  workspaceId: 'folder-1',
  path: 'Long note.md',
  title: 'Long note',
  text,
})

test('a selection longer than Theorem takes is sent up to its limit', () => {
  // Quotes double once they are JSON, so counting characters would overshoot.
  const text = '"'.repeat(20_000)
  const [saved] = askReferences(
    device(text),
    { part: 'selected passage', text },
    {
      documentId: 'document-1',
      documentKind: 'authored',
      revision: { position: 3 },
    } as never,
  )
  expect(onTheWire(saved)).toBeLessThanOrEqual(8192)
  expect(saved?.excerpt?.length).toBeGreaterThan(1000)
  const [passage, copy] = askReferences(device(text), {
    part: 'selected passage',
    text,
  })
  expect(onTheWire(passage)).toBeLessThanOrEqual(8192)
  expect(copy?.excerpt).toBe(text)
})

test('a note longer than Theorem takes is sent around the passage asked about', () => {
  const asked = 'The sentence the person asked about.'
  const text = `${'before '.repeat(150_000)}${asked}${' after'.repeat(150_000)}`
  const [, copy] = askReferences(device(text), {
    part: 'selected text',
    text: asked,
  })
  expect(onTheWire(copy)).toBeLessThanOrEqual(256 * 1024)
  expect(copy?.excerpt).toContain(asked)
})

test('clipping never cuts a character in half, which Theorem could not parse', () => {
  // The odd letter puts the note's clip point in the middle of a character.
  const text = `${'𝒳'.repeat(60_000)}x${'𝒳'.repeat(140_000)}`
  for (const reference of askReferences(device(text), {
    part: 'selected passage',
    text: text.slice(120_001, 130_001),
  }))
    expect(JSON.stringify(reference)).not.toMatch(/\\ud[89a-f]/i)
})
