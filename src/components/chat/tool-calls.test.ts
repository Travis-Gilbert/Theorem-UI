// SOURCING: bun:test over what a reply's host calls and App checks say in the tool-calls section (theorem-parts.tsx).
import { expect, test } from 'bun:test'
import { callWords, hostCallState, toolCallEntries } from './theorem-parts'

const call = (name: string, state: string) => ({
  type: 'data',
  name: 'theorem-host_call',
  data: { name, effect: 'Read', state },
})

test('a call is done only when the host resolved it', () => {
  expect(hostCallState('resolved', true)).toBe('done')
  expect(hostCallState('failed', false)).toBe('failed')
  expect(hostCallState('pending', true)).toBe('running')
  expect(hostCallState('awaiting_approval', true)).toBe('awaiting')
  // A run that stopped left these unfinished: neither is done.
  expect(hostCallState('pending', false)).toBe('interrupted')
  expect(hostCallState('awaiting_approval', false)).toBe('interrupted')
  expect(hostCallState(undefined, false)).toBe('interrupted')
})

test('a known function is worded by its state', () => {
  expect(callWords('search_memory', 'running')).toBe('Searching memory…')
  expect(callWords('search_memory', 'done')).toBe('Searched memory')
  expect(callWords('search_history', 'failed')).toBe(
    'Could not search conversation history',
  )
  expect(callWords('read_document', 'interrupted')).toBe(
    'Reading a document · did not finish',
  )
  expect(callWords('read_file', 'awaiting')).toBe(
    'Reading a file · waiting for your approval',
  )
})

test('a function outside the table keeps its own name, with its state beside it', () => {
  expect(callWords('linear_create_issue', 'done')).toBe('Linear create issue')
  expect(callWords('linear_create_issue', 'running')).toBe(
    'Linear create issue…',
  )
  expect(callWords('kit_gesture', 'failed')).toBe('Kit gesture · failed')
})

test('each routine call is a row, and an artifact call is left to its card', () => {
  const content = [
    call('search_memory', 'resolved'),
    call('create_artifact', 'resolved'),
    call('kit.gesture', 'failed'),
    call('read_document', 'pending'),
    { type: 'text', text: 'An answer.' },
  ]
  const entries = toolCallEntries(content, true)
  expect(entries.map(({ message }) => message)).toEqual([
    'Searched memory',
    'Kit gesture · failed',
    'Reading a document…',
  ])
  expect(entries.map((entry) => entry.tool_category)).toEqual([
    'memory',
    'kit',
    'documents',
  ])
})

test('an App check is a row whose output is the problems it found', () => {
  const check = (problems: unknown[]) => ({
    type: 'data',
    name: 'theorem-client_operation',
    data: {
      operation: 'app.check',
      state: 'answered',
      receipt: {
        outcome: 'applied',
        result: { built: true, omitted: 0, problems },
      },
    },
  })
  const [found] = toolCallEntries(
    [
      check([
        { file: 'App.tsx', line: 42, message: 'No such property.' },
        { message: 'Unused import.' },
      ]),
    ],
    false,
  )
  expect(found).toMatchObject({
    message: 'Checked the App: 2 problems',
    output: 'App.tsx:42  No such property.\nUnused import.',
  })
  const [clean] = toolCallEntries([check([])], false)
  expect(clean?.message).toBe('Checked the App: no problems')
  expect(clean?.output).toBeUndefined()
  const [unchecked] = toolCallEntries(
    [
      {
        type: 'data',
        name: 'theorem-client_operation',
        data: {
          operation: 'app.check',
          state: 'answered',
          receipt: {
            outcome: 'applied',
            result: {
              built: true,
              omitted: 0,
              problems: [],
              typeCheckError: 'The type checker could not start',
            },
          },
        },
      },
    ],
    false,
  )
  expect(unchecked).toMatchObject({
    message: 'Checked the App: its types could not be checked',
    output: 'The type checker could not start',
  })
  // Kit's operations are the fox's to show.
  expect(
    toolCallEntries(
      [
        {
          type: 'data',
          name: 'theorem-client_operation',
          data: { operation: 'kit.move' },
        },
      ],
      false,
    ),
  ).toEqual([])
})
