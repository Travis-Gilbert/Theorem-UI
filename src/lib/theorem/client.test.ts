import { expect, test } from 'bun:test'
import { TheoremError } from '@theoremharness/sdk'
import { describeError, describeRunFailure } from './client'

test('an API refusal shows its explanation and reference, not the SDK dump', () => {
  const error = new TheoremError({
    statusCode: 422,
    body: {
      code: 'chat_model_not_configured',
      title: 'The requested chat model is not available',
      detail: 'Choose a model configured on this server.',
      correlationId: 'chatreq-test',
    },
  })
  expect(describeError(error)).toBe(
    'Choose a model configured on this server. Reference: chatreq-test',
  )
})

test('a partial send says the message was saved and preserves its cause', () => {
  expect(
    describeError(
      new TheoremError({
        statusCode: 503,
        body: {
          code: 'chat_run_start_pending',
          detail: 'The model service is unavailable.',
        },
      }),
    ),
  ).toBe(
    'Your message was saved, but its response could not start. Reload this conversation to resume it. The model service is unavailable.',
  )
})

test.each([
  [401, 'Sign in to continue.'],
  [403, 'You do not have permission to perform this action.'],
  [413, 'The message or attachment is too large.'],
  [429, 'Too many requests. Try again shortly.'],
  [503, 'The chat service is unavailable. Try again shortly.'],
])(
  'status %i has a useful fallback when no problem body is available',
  (statusCode, message) => {
    expect(
      describeError(
        new TheoremError({ statusCode, body: '<html>proxy error</html>' }),
      ),
    ).toBe(message)
  },
)

test('malformed problem fields are never rendered as objects', () => {
  expect(
    describeError(
      new TheoremError({ statusCode: 400, body: { detail: {}, title: 12 } }),
    ),
  ).toBe('The request could not be completed.')
})

test('ordinary errors keep their message', () => {
  expect(describeError(new Error('The connection was interrupted.'))).toBe(
    'The connection was interrupted.',
  )
})

test('run failures use the public event description and request reference', () => {
  expect(
    describeRunFailure({
      message: 'The response could not be saved.',
      correlation_id: 'run-request',
    }),
  ).toBe('The response could not be saved. Reference: run-request')
  expect(
    describeRunFailure({ message: {}, diagnostic: 'private diagnostic' }),
  ).not.toContain('private diagnostic')
})

// Envelope comes from theorem_chat.rs chat_error(Store), not a captured body;
// detail/reference are the exact failure displayed during mounted acceptance.
const journalFullDetail = 'chunk_store_journal_io: append journal record: No space left on device (os error 28)'
const storageReference = 'chatreq_01M6QFM64PDHBTYJ7T036GDB3K'

test('a source-bound store-full problem explains capacity without guessing persistence', () => {
  const message = describeError(new TheoremError({ statusCode: 500, body: {
    type: '/problems/chat_store_error',
    code: 'chat_store_error', title: 'The chat graph could not satisfy the request',
    detail: journalFullDetail, correlationId: storageReference,
  } }))
  expect(message).toBe(`The server ran out of storage while processing this request. Retry after server storage capacity is restored. Code: chat_store_error / chunk_store_journal_io. Reference: ${storageReference}`)
  expect(message).not.toMatch(/message was (?:not )?saved|message was not sent/)
})

test.each([
  ['chat_store_error', 'chunk_store_journal_io: append journal record: Permission denied (os error 13)'],
  ['chat_store_error', 'chunk_store_journal_poisoned: No space left on device (os error 28)'],
  ['other_failure', journalFullDetail],
])('unrelated storage conditions retain their actual detail: %s %s', (code, detail) => {
  expect(describeError(new TheoremError({ statusCode: 500, body: { code, detail, correlationId: storageReference } }))).toBe(`${detail} Reference: ${storageReference}`)
})

test('a store problem without a detail does not invent capacity exhaustion', () => {
  expect(describeError(new TheoremError({ statusCode: 500, body: {
    code: 'chat_store_error', title: 'Unspecified store failure', correlationId: storageReference,
  } }))).toBe(`Unspecified store failure Reference: ${storageReference}`)
})
