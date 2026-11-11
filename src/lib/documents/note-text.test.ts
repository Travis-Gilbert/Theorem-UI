// SOURCING: bun:test over the plain paragraphs a margin note shows.
import { expect, test } from 'bun:test'
import { replyBlocks } from './note-text'

test('a reply becomes plain paragraphs, its formatting dropped', () => {
  expect(
    replyBlocks(
      '## Why\n\nThe **claim** rests on [one study](https://x.test).\n\n`n = 12`',
    ),
  ).toEqual(['Why', 'The claim rests on one study.', 'n = 12'])
})

test('a list keeps one line per item, bulleted', () => {
  expect(replyBlocks('Two gaps:\n\n- no control\n- small *sample*')).toEqual([
    'Two gaps:',
    '• no control',
    '• small sample',
  ])
  expect(replyBlocks('1. first\n2. second')).toEqual(['1. first', '2. second'])
})

test('an empty reply has no paragraphs', () => {
  expect(replyBlocks('')).toEqual([])
  expect(replyBlocks('  \n\n ')).toEqual([])
})
