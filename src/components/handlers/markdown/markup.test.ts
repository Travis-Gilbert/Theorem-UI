// SOURCING: bun:test over an EditorState with the markup plugin and
// prosemirror-history, as Crepe runs them on the document screen.
import { expect, test } from 'bun:test'
import { Schema } from '@milkdown/kit/prose/model'
import { history, undo } from '@milkdown/kit/prose/history'
import { EditorState } from '@milkdown/kit/prose/state'
import type { Transaction } from '@milkdown/kit/prose/state'
import {
  applyEdit,
  applyEdits,
  markupKey,
  markupPlugin,
  revertEdits,
  setMarkup,
} from './markup'
import type { MarkupItem } from './markup'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    text: {},
  },
})

function editor() {
  let state = EditorState.create({
    doc: schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('We saw teh results.')]),
      schema.node('paragraph', null, [schema.text('The second paragraph.')]),
    ]),
    plugins: [history(), markupPlugin()],
  })
  const dispatch = (tr: Transaction) => {
    state = state.apply(tr)
  }
  return {
    get state() {
      return state
    },
    dispatch,
  }
}

const passage: MarkupItem = {
  id: 'ask',
  kind: 'passage',
  quote: { exact: 'We saw teh results.' },
}
const comment: MarkupItem = {
  id: 'mark',
  kind: 'comment',
  quote: { exact: 'second paragraph' },
  near: 'ask',
}

const marked = (state: EditorState) =>
  markupKey
    .getState(state)!
    .decorations.find()
    .map((d) => state.doc.textBetween(d.from, d.to))

test('the passage and the agent’s marks show on their text', () => {
  const view = editor()
  view.dispatch(setMarkup(view.state, { items: [passage, comment] }))
  expect(marked(view.state)).toEqual([
    'We saw teh results.',
    'second paragraph',
  ])
})

test('a mark stays on its text as the person types before it', () => {
  const view = editor()
  view.dispatch(setMarkup(view.state, { items: [comment] }))
  view.dispatch(view.state.tr.insertText('Indeed. ', 1))
  expect(marked(view.state)).toEqual(['second paragraph'])
})

test('a quote the note does not hold is reported missing, not shown', () => {
  const view = editor()
  const lost = { ...comment, quote: { exact: 'third paragraph' } }
  view.dispatch(setMarkup(view.state, { items: [lost] }))
  expect(marked(view.state)).toEqual([])
  expect(markupKey.getState(view.state)!.ranges.has('mark')).toBe(false)
})

test('the agent’s edit applies as one step the person can undo', () => {
  const view = editor()
  const edit = {
    markId: 'fix',
    kind: 'edit' as const,
    quote: { exact: 'teh' },
    replacement: 'the',
  }
  expect(applyEdit(edit)(view.state, view.dispatch)).toBe(true)
  expect(view.state.doc.textContent).toStartWith('We saw the results.')
  // The changed text shows as the agent's.
  expect(marked(view.state)).toEqual(['the'])
  undo(view.state, view.dispatch)
  expect(view.state.doc.textContent).toStartWith('We saw teh results.')
})

test('an edit whose text is gone does not apply', () => {
  const view = editor()
  const edit = {
    markId: 'fix',
    kind: 'edit' as const,
    quote: { exact: 'tehm' },
    replacement: 'them',
  }
  expect(applyEdit(edit)(view.state, view.dispatch)).toBe(false)
})

test('a reply’s edits apply together, one undo step, and those not found are named', () => {
  const view = editor()
  const fix = (markId: string, exact: string, replacement: string) => ({
    markId,
    kind: 'edit' as const,
    quote: { exact },
    replacement,
  })
  const { applied, missing } = applyEdits([
    fix('a', 'teh', 'the'),
    fix('b', 'second', 'next'),
    fix('c', 'fourth', 'last'),
  ])(view.state, view.dispatch)
  expect(applied).toEqual(['a', 'b'])
  expect(missing).toEqual(['c'])
  expect(view.state.doc.textContent).toBe(
    'We saw the results.The next paragraph.',
  )
  expect(marked(view.state)).toEqual(['the', 'next'])
  undo(view.state, view.dispatch)
  expect(view.state.doc.textContent).toBe(
    'We saw teh results.The second paragraph.',
  )
})

test('undoing an edit from its note puts the text back', () => {
  const view = editor()
  const edit = {
    markId: 'fix',
    kind: 'edit' as const,
    quote: { exact: 'teh' },
    replacement: 'the',
  }
  applyEdit(edit)(view.state, view.dispatch)
  expect(revertEdits([edit])(view.state, view.dispatch)).toBe(true)
  expect(view.state.doc.textContent).toStartWith('We saw teh results.')
  expect(marked(view.state)).toEqual([])
})
