// SOURCING: bun:test over loro-crdt, checking the note layout Theorem Documents v2 stores
import { describe, expect, test } from 'bun:test'
import { LoroDoc } from 'loro-crdt/base64'
import {
  contentDigest,
  encodeNote,
  isEditableNote,
  mergeNote,
  noteMarkdown,
  reviseNote,
} from './note-canonical'

describe('note canonical snapshots', () => {
  test('encode and read back', () => {
    const canonical = encodeNote('# Title\n\nBody\n')
    expect(isEditableNote(canonical)).toBe(true)
    expect(noteMarkdown(canonical)).toBe('# Title\n\nBody\n')
  })

  test('a revision keeps the history of the one before it', () => {
    const first = encodeNote('one')
    const second = reviseNote(first, 'one two')
    expect(noteMarkdown(second)).toBe('one two')
    const before = LoroDoc.fromSnapshot(first).oplogVersion()
    const after = LoroDoc.fromSnapshot(second)
    // The new snapshot contains every operation of the old one.
    expect(after.oplogVersion().compare(before)).toBe(1)
  })

  test('concurrent edits on one base merge instead of overwriting', () => {
    const base = encodeNote('alpha\n\nomega\n')
    const remote = reviseNote(base, 'alpha remote\n\nomega\n')
    const merged = mergeNote(base, 'alpha\n\nomega local\n', remote)
    expect(merged?.markdown).toBe('alpha remote\n\nomega local\n')
    expect(noteMarkdown(merged!.canonical)).toBe(merged!.markdown)
  })

  test('text typed during a merged save merges onto the saved result', () => {
    const base = encodeNote('alpha\n\nomega\n')
    const local = reviseNote(base, 'alpha local\n\nomega\n')
    const remote = reviseNote(base, 'alpha\n\nomega remote\n')
    const saved = mergeNote(local, 'alpha local\n\nomega\n', remote)!
    expect(saved.markdown).toBe('alpha local\n\nomega remote\n')
    // Typed against the local text while the merged save was in flight.
    const later = mergeNote(
      local,
      'alpha local more\n\nomega\n',
      saved.canonical,
    )
    expect(later?.markdown).toBe('alpha local more\n\nomega remote\n')
  })

  test('layouts with more than one block are not editable notes', () => {
    const doc = new LoroDoc()
    const root = doc.getTree('blocks').createNode()
    for (const text of ['first', 'second']) {
      const block = root.createNode()
      doc.getMap(`attrs:${block.id}`).set('kind', 'paragraph')
      doc.getText(`text:${block.id}`).insert(0, text)
    }
    doc.commit()
    const canonical = doc.export({ mode: 'snapshot' })
    expect(isEditableNote(canonical)).toBe(false)
    expect(noteMarkdown(canonical)).toBeUndefined()
    expect(() => reviseNote(canonical, 'flattened')).toThrow()
    expect(mergeNote(canonical, 'flattened', canonical)).toBeUndefined()
  })

  test('a single block of another kind is not an editable note', () => {
    const doc = new LoroDoc()
    const block = doc.getTree('blocks').createNode().createNode()
    doc.getMap(`attrs:${block.id}`).set('kind', 'heading')
    doc.getText(`text:${block.id}`).insert(0, 'Title')
    doc.commit()
    expect(isEditableNote(doc.export({ mode: 'snapshot' }))).toBe(false)
  })

  test('digest is sha256 over the exact bytes', async () => {
    expect(await contentDigest(new TextEncoder().encode('abc'))).toBe(
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
