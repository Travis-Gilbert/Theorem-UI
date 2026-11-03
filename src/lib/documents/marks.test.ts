// SOURCING: bun:test over the tool result the document screen reads, shaped
// as assistant-ui hands a mark_up_document call over.
import { expect, test } from 'bun:test'
import { marksOf, replyOf } from './marks'

const resource = {
  kind: 'file',
  workspaceId: 'home',
  path: 'Research notes.md',
}
const comment = {
  markId: 'mark_1',
  kind: 'comment',
  quote: { exact: 'the first paragraph', suffix: '.' },
  body: 'This could open with the claim.',
}
const edit = {
  markId: 'mark_2',
  kind: 'edit',
  quote: { exact: 'teh' },
  replacement: 'the',
}
const call = (result: unknown, toolName = 'mark_up_document') => ({
  type: 'tool-call',
  toolCallId: 'call_1',
  toolName,
  args: {},
  result,
})

test('a markup call gives the marks its result carries', () => {
  const content = [
    { type: 'text', text: 'Two notes.' },
    call({
      contract: 'theorem-document-markup-v1',
      resource,
      marks: [comment, edit],
    }),
  ]
  expect(marksOf(content)).toEqual([comment, edit] as never)
})

test('a call still running, another tool or a refusal gives no marks', () => {
  expect(marksOf([call(undefined)])).toEqual([])
  expect(
    marksOf([
      call(
        { contract: 'theorem-document-markup-v1', resource, marks: [comment] },
        'create_artifact',
      ),
    ]),
  ).toEqual([])
  expect(
    marksOf([call({ error: { code: 'invalid', message: 'no quote' } })]),
  ).toEqual([])
})

test('an edit without its replacement is not a mark', () => {
  const { replacement: _, ...broken } = edit
  expect(
    marksOf([
      call({
        contract: 'theorem-document-markup-v1',
        resource,
        marks: [broken],
      }),
    ]),
  ).toEqual([])
})

test('the reply is the message text, its parts apart', () => {
  expect(
    replyOf([
      { type: 'text', text: 'First.' },
      call(undefined),
      { type: 'text', text: 'Second.' },
    ]),
  ).toBe('First.\n\nSecond.')
})
