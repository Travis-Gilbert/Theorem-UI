// SOURCING: bun:test over a ProseMirror document built from a minimal schema,
// as the Markdown editor names a selection and anchors the agent's quotes.
import { expect, test } from 'bun:test'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection } from '@milkdown/kit/prose/state'
import { anchorQuote, askRange, proseExcerpt, quoteAt } from './selection'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    heading: { group: 'block', content: 'text*' },
    text: {},
  },
})
const doc = schema.node('doc', null, [
  schema.node('heading', null, [schema.text('Findings')]),
  schema.node('paragraph', null, [schema.text('The first paragraph.')]),
])
// The heading spans 0–10 (text 1–9); the paragraph 10–32 (text 11–31).

test('nothing selected is no excerpt', () => {
  expect(proseExcerpt(doc, 12, 12)).toBeUndefined()
})

test('a whole paragraph is the selected paragraph, with its text', () => {
  expect(proseExcerpt(doc, 11, 31)).toEqual({
    part: 'selected paragraph',
    text: 'The first paragraph.',
  })
})

test('part of a block is selected text', () => {
  expect(proseExcerpt(doc, 15, 20)?.part).toBe('selected text')
})

test('a selection across blocks is a passage, its blocks apart', () => {
  expect(proseExcerpt(doc, 1, 31)).toEqual({
    part: 'selected passage',
    text: 'Findings\n\nThe first paragraph.',
  })
})

const repeated = EditorState.create({
  doc: schema.node('doc', null, [
    schema.node('paragraph', null, [
      schema.text('A cat sat. Then the cat ran.'),
    ]),
    schema.node('paragraph', null, [schema.text('No animals here.')]),
  ]),
})
// The first paragraph's text runs from 1; "cat" is at 3–6 and 21–24.

test('a selection is quoted with the text around it, as the agent will see it', () => {
  expect(quoteAt(repeated.doc, 21, 24)).toEqual({
    exact: 'cat',
    prefix: 'A cat sat. Then the ',
    suffix: ' ran.\n\nNo animals here.',
  })
})

test('a quote is found where its prefix and suffix agree', () => {
  expect(anchorQuote(repeated, { exact: 'cat', prefix: 'Then the ' })).toEqual({
    from: 21,
    to: 24,
  })
  expect(anchorQuote(repeated, { exact: 'cat', suffix: ' sat' })).toEqual({
    from: 3,
    to: 6,
  })
})

test('without context, the match nearest the passage asked about wins', () => {
  expect(anchorQuote(repeated, { exact: 'cat' }, 25)).toEqual({
    from: 21,
    to: 24,
  })
  expect(anchorQuote(repeated, { exact: 'cat' })).toEqual({ from: 3, to: 6 })
})

test('a quote the document does not hold has no anchor', () => {
  expect(anchorQuote(repeated, { exact: 'dog' })).toBeUndefined()
})

const asked = (from: number, to = from) =>
  EditorState.create({
    doc,
    selection: TextSelection.create(doc, from, to),
  })

test('an ask is about the selection', () => {
  expect(askRange(asked(15, 20))).toEqual({ from: 15, to: 20 })
  expect(askRange(asked(15, 20), 17)).toEqual({ from: 15, to: 20 })
})

test('with nothing selected, or a click outside it, an ask is about the block', () => {
  expect(askRange(asked(12))).toEqual({ from: 11, to: 31 })
  expect(askRange(asked(15, 20), 3)).toEqual({ from: 1, to: 9 })
})

test('an empty block is nothing to ask about', () => {
  const empty = schema.node('doc', null, [schema.node('paragraph')])
  const state = EditorState.create({ doc: empty })
  expect(askRange(state, 1)).toBeUndefined()
})

test('a passage across blocks is found from its first block to its last', () => {
  const state = EditorState.create({ doc })
  expect(
    anchorQuote(state, { exact: 'Findings\n\nThe first paragraph.' }),
  ).toEqual({
    from: 1,
    to: 31,
  })
  expect(
    anchorQuote(state, { exact: 'Findings\n\nThe second paragraph.' }),
  ).toBeUndefined()
})

test('a passage across blocks is not found once a block between them changed', () => {
  const state = EditorState.create({
    doc: schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('One.')]),
      schema.node('paragraph', null, [schema.text('Two.')]),
      schema.node('paragraph', null, [schema.text('Three.')]),
    ]),
  })
  // The paragraphs' text runs 1–5, 7–11 and 13–19.
  expect(anchorQuote(state, { exact: 'One.\n\nTwo.\n\nThree.' })).toEqual({
    from: 1,
    to: 19,
  })
  expect(
    anchorQuote(state, { exact: 'One.\n\nChanged.\n\nThree.' }),
  ).toBeUndefined()
})

const linked = new Schema({
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

test('a passage with a link in it is found, the link quoted as written', () => {
  const state = EditorState.create({
    doc: linked.node('doc', null, [
      linked.node('paragraph', null, [
        linked.text('It links to '),
        linked.node('wikiLink', { value: 'Reading list' }),
        linked.text('.'),
      ]),
    ]),
  })
  // The paragraph's text runs 1–15: twelve characters, the link, a period.
  const quote = quoteAt(state.doc, 1, 15)
  expect(quote.exact).toBe('It links to [[Reading list]].')
  expect(anchorQuote(state, quote)).toEqual({ from: 1, to: 15 })
  expect(anchorQuote(state, { exact: 'to [[Reading list]]' })).toEqual({
    from: 10,
    to: 14,
  })
})
