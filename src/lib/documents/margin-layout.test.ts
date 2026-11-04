// SOURCING: bun:test over the margin's stacking, as the margin calls it with
// each note's anchor and its height from pretext.
import { expect, test } from 'bun:test'
import { NOTE, noteHeight, stackNotes } from './margin-layout'

const GAP = 8

test('notes far apart sit level with their passages', () => {
  const tops = stackNotes(
    [
      { id: 'a', anchor: 40, height: 60 },
      { id: 'b', anchor: 200, height: 60 },
    ],
    GAP,
  )
  expect(tops).toEqual(
    new Map([
      ['a', 40],
      ['b', 200],
    ]),
  )
})

test('a note that would overlap the one above it moves down below it', () => {
  const tops = stackNotes(
    [
      { id: 'b', anchor: 60, height: 40 },
      { id: 'a', anchor: 40, height: 100 },
    ],
    GAP,
  )
  expect(tops).toEqual(
    new Map([
      ['a', 40],
      ['b', 148],
    ]),
  )
})

test('the note being read sits at its passage, and the ones above make room', () => {
  const tops = stackNotes(
    [
      { id: 'a', anchor: 140, height: 40 },
      { id: 'b', anchor: 160, height: 40 },
      { id: 'c', anchor: 170, height: 20 },
    ],
    GAP,
    'b',
  )
  // a moves up to end a gap above b; c goes below b.
  expect(tops).toEqual(
    new Map([
      ['a', 112],
      ['b', 160],
      ['c', 208],
    ]),
  )
})

test('no note leaves the top of the margin: the note being read moves down instead', () => {
  const tops = stackNotes(
    [
      { id: 'a', anchor: 40, height: 100 },
      { id: 'b', anchor: 60, height: 40 },
      { id: 'c', anchor: 70, height: 20 },
    ],
    GAP,
    'b',
  )
  // a would have to start at -48 to end a gap above b at 60.
  expect(tops).toEqual(
    new Map([
      ['a', 0],
      ['b', 108],
      ['c', 156],
    ]),
  )
})

test('notes above the one being read keep the room the notes above them take', () => {
  // A reply and its comment share a line; the note being read is below them.
  const tops = stackNotes(
    [
      { id: 'a', anchor: 40, height: 100 },
      { id: 'b', anchor: 40, height: 40 },
      { id: 'c', anchor: 60, height: 20 },
    ],
    GAP,
    'c',
  )
  expect(tops).toEqual(
    new Map([
      ['a', 0],
      ['b', 108],
      ['c', 156],
    ]),
  )
})

test('a note is as tall as its measured text, its summary too, and its actions row', () => {
  // Each line of text measures 20; a block of n characters takes n lines.
  const measure = (text: string) => text.length * NOTE.line
  const box = 2 * (NOTE.pad + NOTE.border)
  expect(noteHeight({ blocks: ['ab'] }, measure)).toBe(box + 40)
  expect(
    noteHeight(
      { question: 'q', blocks: ['a', 'bc'], summary: 'xyz', actions: true },
      measure,
    ),
  ).toBe(
    box +
      20 +
      NOTE.gapQuestion +
      20 +
      NOTE.gapParagraph +
      40 +
      NOTE.gapRow +
      60 +
      NOTE.gapRow +
      NOTE.actions,
  )
})
