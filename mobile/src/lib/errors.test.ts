// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import { describeError, statusOf } from './errors'

const http = (statusCode: number, body?: unknown, message = `Status code: ${statusCode}\nBody: ${JSON.stringify(body)}`) =>
  Object.assign(new Error(message), { statusCode, body })

describe('describeError', () => {
  test('says what the server said in words', () => {
    expect(describeError(http(422, { detail: 'The thread is archived.' }))).toBe('The thread is archived.')
    expect(describeError(http(400, { title: 'Bad request' }))).toBe('Bad request')
    expect(describeError(http(400, { message: 'Model not available.' }))).toBe('Model not available.')
    expect(describeError(http(400, { error: { message: 'Run could not start.' } }))).toBe('Run could not start.')
  })

  test('never shows a response body or an HTTP dump', () => {
    const raw = http(400, { code: 'chat_run_start_failed', status: 400, retryable: false })
    const text = describeError(raw)
    expect(text).not.toContain('{')
    expect(text).not.toContain('Body:')
    expect(text).not.toContain('Status code')
    expect(text.length).toBeGreaterThan(0)
  })

  test('a message that is only serialized JSON is not shown', () => {
    expect(describeError(new Error('{"code":"x","retryable":false}'))).toBe('Something went wrong.')
    expect(describeError(new Error('[{"a":1}]'))).toBe('Something went wrong.')
  })

  test('keeps the first line of a plain message and drops the dump after it', () => {
    expect(describeError(new Error('Network request failed\n\tStatus code: undefined\n\tBody: {}'))).toBe(
      'Network request failed',
    )
  })

  test('maps statuses with no readable body', () => {
    expect(describeError(http(401, {}))).toBe('Theorem refused this request. Sign in again.')
    expect(describeError(http(409, {}))).toBe('The conversation changed on the server. It has been reloaded.')
    expect(describeError(http(503, {}))).toBe('Theorem is unavailable right now. Try again shortly.')
  })

  test('statusOf reads only a numeric status', () => {
    expect(statusOf(http(404, {}))).toBe(404)
    expect(statusOf(Object.assign(new Error('x'), { statusCode: '404' }))).toBeUndefined()
    expect(statusOf(null)).toBeUndefined()
  })
})
