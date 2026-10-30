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
  ).toBe('The request could not be completed (HTTP 400).')
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
