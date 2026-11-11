// SOURCING: bun:test over what a note's asks show in it.
import { expect, test } from 'bun:test'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState } from '@milkdown/kit/prose/state'
import type { Ask } from '@/lib/documents/ask-store'
import {
  markSummary,
  markupItems,
  movedQuotes,
  pendingEdits,
} from './ask-items'
import { applyEdits, markupPlugin, setMarkup } from './markup'

const ask: Ask = {
  id: 'ask',
  question: 'Is this right?',
  passage: { exact: 'We saw teh results.' },
  part: 'selected paragraph',
  reply: 'Mostly.',
  marks: [
    {
      markId: 'c',
      kind: 'comment',
      quote: { exact: 'results' },
      body: 'Which ones?',
    },
    { markId: 'h', kind: 'highlight', quote: { exact: 'We saw' } },
    {
      markId: 'made',
      kind: 'edit',
      quote: { exact: 'teh', prefix: 'saw ' },
      replacement: 'the',
    },
    {
      markId: 'new',
      kind: 'edit',
      quote: { exact: 'saw' },
      replacement: 'found',
    },
    {
      markId: 'lost',
      kind: 'edit',
      quote: { exact: 'tehm' },
      replacement: 'them',
    },
  ],
  edits: { made: 'applied', lost: 'missing' },
  status: 'done',
}

test('an ask shows its passage, the agent’s marks, and the edits it made', () => {
  expect(markupItems([ask])).toEqual([
    { id: 'ask', kind: 'passage', quote: { exact: 'We saw teh results.' } },
    {
      id: 'c',
      kind: 'comment',
      quote: { exact: 'results' },
      near: 'ask',
      label: 'Which ones?',
    },
    { id: 'h', kind: 'highlight', quote: { exact: 'We saw' }, near: 'ask' },
    // A made edit is found by its new text, between the text either side.
    {
      id: 'made',
      kind: 'edit',
      quote: { exact: 'the', prefix: 'saw ' },
      near: 'ask',
    },
  ])
})

test('an edit is made once: not again after it was made, undone or not found', () => {
  expect(pendingEdits(ask).map((edit) => edit.markId)).toEqual(['new'])
  expect(
    pendingEdits({ ...ask, edits: { ...ask.edits, new: 'undone' } }),
  ).toEqual([])
})

test('the summary counts what was found, and the rest as not found', () => {
  // The comment and highlight were found; the made edit shows; "lost" was not.
  expect(markSummary(ask, new Set(['c', 'h']))).toBe(
    '1 comment · 1 highlight · changed 2 places · 1 not found',
  )
  // A comment the note no longer holds is not found, not a comment.
  expect(markSummary(ask, new Set(['h']))).toBe(
    '1 highlight · changed 2 places · 2 not found',
  )
})

test('what an ask shows is found where its text now is, once it was quoted again', () => {
  const moved = { ...ask, quotes: { ask: { exact: 'We saw the results.' } } }
  expect(markupItems([moved])[0]).toEqual({
    id: 'ask',
    kind: 'passage',
    quote: { exact: 'We saw the results.' },
  })
})

test('text under a passage or a comment that changed is quoted again as it now reads', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'text*' },
      text: {},
    },
  })
  const edited: Ask = {
    ...ask,
    marks: [
      {
        markId: 'c',
        kind: 'comment',
        quote: { exact: 'saw teh' },
        body: 'Typo.',
      },
      { markId: 'h', kind: 'highlight', quote: { exact: 'results' } },
    ],
    edits: {},
  }
  let state = EditorState.create({
    doc: schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('Intro.')]),
      schema.node('paragraph', null, [schema.text('We saw teh results.')]),
    ]),
    plugins: [markupPlugin()],
  })
  state = state.apply(setMarkup(state, { items: markupItems([edited]) }))
  expect(movedQuotes([edited], state)).toEqual([])

  applyEdits([
    { markId: 'e', kind: 'edit', quote: { exact: 'teh' }, replacement: 'the' },
  ])(state, (tr) => (state = state.apply(tr)))
  // The highlight still reads as it did, so only the passage and the comment.
  expect(movedQuotes([edited], state)).toEqual([
    {
      id: 'ask',
      quotes: {
        ask: { exact: 'We saw the results.', prefix: 'Intro.\n\n', suffix: '' },
        c: { exact: 'saw the', prefix: 'Intro.\n\nWe ', suffix: ' results.' },
      },
    },
  ])
})
