import { expect, test } from 'bun:test'
import { noteStats } from './note-stats'

test('counts the body’s words and characters, not its frontmatter', () => {
  expect(
    noteStats('---\ntags: [map]\n---\n# Hub\n\nSee [[Ideas]], twice.\n'),
  ).toEqual({ words: 4, characters: 26 })
})

test('counts words without spaces and emoji as one character each', () => {
  expect(noteStats('日本語の文章 👍🏽')).toEqual({
    words: noteStats('日本語の文章').words,
    characters: 8,
  })
  expect(noteStats('').words).toBe(0)
})
