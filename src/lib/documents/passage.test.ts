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
      at: 10,
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
      { part: 'selected text', text: 'Selected passage', at: 0 },
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
    { part: 'selected passage', text, at: 0 },
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
    at: 0,
  })
  expect(onTheWire(passage)).toBeLessThanOrEqual(8192)
  expect(copy?.excerpt).toBe(text)
})

test('a note longer than Theorem takes is sent around the passage asked about', () => {
  const asked = 'The sentence the person asked about.'
  const before = 'before '.repeat(150_000)
  const text = `${before}${asked}${' after'.repeat(150_000)}`
  const [, copy] = askReferences(device(text), {
    part: 'selected text',
    text: asked,
    at: before.length,
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
    at: 120_001,
  }))
    expect(JSON.stringify(reference)).not.toMatch(/\\ud[89a-f]/i)
})

test('clipping keeps all that fits when the text is uneven', () => {
  // Estimating from the whole text's size would keep under 2,000 of these.
  const letters = 'a'.repeat(7_000)
  const [passage] = askReferences(device('The note.'), {
    part: 'selected passage',
    text: `${letters}${'😀'.repeat(100_000)}`,
    at: 0,
  })
  // 7 KiB of JSON: two quotes, the letters, and 41 four-byte characters.
  expect(passage?.excerpt).toBe(`${letters}${'😀'.repeat(41)}`)
})

test('a long note is sent around the very words picked, not an earlier copy of them', () => {
  const asked = 'The sentence that repeats.'
  const earlier = `${asked}${' before'.repeat(150_000)}`
  const text = `${earlier}${asked} Only here.${' after'.repeat(150_000)}`
  const [, copy] = askReferences(device(text), {
    part: 'selected text',
    text: asked,
    at: earlier.length,
  })
  expect(onTheWire(copy)).toBeLessThanOrEqual(256 * 1024)
  expect(copy?.excerpt).toContain(`${asked} Only here.`)
})
