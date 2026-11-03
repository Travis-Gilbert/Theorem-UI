// SOURCING: bun:test over an EditorState with the markup plugin and
// prosemirror-history, as Crepe runs them on the document screen.
import { expect, test } from 'bun:test'
import { Schema } from '@milkdown/kit/prose/model'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { history, undo } from '@milkdown/kit/prose/history'
import { EditorState } from '@milkdown/kit/prose/state'
import type { Transaction } from '@milkdown/kit/prose/state'
import {
  applyEdit,
  applyEdits,
  editShows,
  markupKey,
  markupPlugin,
  revertEdits,
  setMarkup,
} from './markup'
import type { MarkupItem } from './markup'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    wikiLink: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { value: {}, alias: { default: null } },
    },
  },
})

/**
 * Markdown to the schema's nodes, as Milkdown's parser gives them: blocks a
 * blank line apart, `[[links]]` as links. Enough for these notes.
 */
const parse = (markdown: string) =>
  schema.node(
    'doc',
    null,
    markdown.split('\n\n').map((block) =>
      schema.node(
        'paragraph',
        null,
        block
          .split(/(\[\[[^\]]+\]\])/)
          .filter(Boolean)
          .map((part) =>
            part.startsWith('[[')
              ? schema.node('wikiLink', { value: part.slice(2, -2) })
              : schema.text(part),
          ),
      ),
    ),
  )

function editor(
  blocks: ProseNode[] = [
    schema.node('paragraph', null, [schema.text('We saw teh results.')]),
    schema.node('paragraph', null, [schema.text('The second paragraph.')]),
  ],
) {
  let state = EditorState.create({
    doc: schema.node('doc', null, blocks),
    // Never drawn here: a widget's element is made only by a view.
    plugins: [
      history(),
      markupPlugin({ parse, widget: () => document.createElement('div') }),
    ],
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

test('a rewrite keeps the links it writes, and its paragraphs, both ways', () => {
  const view = editor([
    schema.node('paragraph', null, [
      schema.text('It links to '),
      schema.node('wikiLink', { value: 'Reading list' }),
      schema.text('.'),
    ]),
  ])
  const edit = {
    markId: 'fix',
    kind: 'edit' as const,
    quote: { exact: 'It links to [[Reading list]].' },
    replacement: 'It points to [[Reading list]].\n\nA second paragraph.',
  }
  const links = () => {
    const found: string[] = []
    view.state.doc.descendants((node) => {
      if (node.type.name === 'wikiLink') found.push(node.attrs.value as string)
    })
    return found
  }
  expect(applyEdit(edit)(view.state, view.dispatch)).toBe(true)
  expect(view.state.doc.childCount).toBe(2)
  expect(view.state.doc.child(1).textContent).toBe('A second paragraph.')
  expect(links()).toEqual(['Reading list'])
  // The note offers to undo it, and undoing it puts the link back as a link.
  expect(editShows(view.state, edit)).toBe(true)
  expect(revertEdits([edit])(view.state, view.dispatch)).toBe(true)
  expect(view.state.doc.childCount).toBe(1)
  expect(view.state.doc.textContent).toBe('It links to .')
  expect(links()).toEqual(['Reading list'])
})

test('text the agent deleted can be put back from its note', () => {
  const view = editor()
  const edit = {
    markId: 'cut',
    kind: 'edit' as const,
    quote: { exact: ' teh' },
    replacement: '',
  }
  expect(applyEdit(edit)(view.state, view.dispatch)).toBe(true)
  expect(view.state.doc.textContent).toStartWith('We saw results.')
  expect(editShows(view.state, edit)).toBe(true)
  expect(revertEdits([edit])(view.state, view.dispatch)).toBe(true)
  expect(view.state.doc.textContent).toStartWith('We saw teh results.')
})

const notesUnder = (state: EditorState) =>
  markupKey
    .getState(state)!
    .decorations.find()
    .flatMap((d) => {
      const key = (d.spec as { key?: string }).key
      return key?.startsWith('note:') ? [key.slice('note:'.length)] : []
    })

test('an ask whose passage an edit rewrote or removed keeps its place, and its note shows under it', () => {
  const rewrite = (exact: string, replacement: string) => {
    const view = editor()
    view.dispatch(
      setMarkup(view.state, {
        items: [{ ...passage, quote: { exact: 'teh results' } }],
        inline: true,
      }),
    )
    applyEdit({ markId: 'fix', kind: 'edit', quote: { exact }, replacement })(
      view.state,
      view.dispatch,
    )
    const range = markupKey.getState(view.state)!.ranges.get('ask')
    return {
      passage: range && view.state.doc.textBetween(range.from, range.to),
      notes: notesUnder(view.state),
    }
  }
  // Rewritten exactly: the passage is the new text.
  expect(rewrite('teh results', 'the results')).toEqual({
    passage: 'the results',
    notes: ['ask'],
  })
  // Rewritten with the text around it, or removed: the block it was in.
  expect(rewrite('We saw teh results.', 'We saw the results.')).toEqual({
    passage: 'We saw the results.',
    notes: ['ask'],
  })
  expect(rewrite(' teh results', '')).toEqual({
    passage: 'We saw.',
    notes: ['ask'],
  })
})
