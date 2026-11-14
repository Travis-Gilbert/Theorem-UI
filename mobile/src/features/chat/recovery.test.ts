// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import { ConversationProtocolError, type ConversationState } from '@theoremharness/sdk'
import { connectionNotice, failureKind } from './recovery'

const describe_ = (error: unknown) => (error instanceof Error ? error.message : String(error))
const http = (statusCode: number, message = `status ${statusCode}`) =>
  Object.assign(new Error(message), { statusCode })
const state = (phase: ConversationState['phase'], error?: unknown) => ({ phase, error })

describe('failureKind', () => {
  test('a dropped connection or server error is a disconnection', () => {
    expect(failureKind(state('failed', new Error('Network request failed')))).toBe('disconnected')
    expect(failureKind(state('failed', http(503)))).toBe('disconnected')
    expect(failureKind(state('failed', http(500)))).toBe('disconnected')
    expect(failureKind(state('detached'))).toBe('disconnected')
    expect(failureKind(state('reconnecting'))).toBe('disconnected')
  })

  test('an ended or refused session is signed out', () => {
    expect(failureKind(state('authentication-required'))).toBe('signed-out')
    expect(failureKind(state('failed', http(401)))).toBe('signed-out')
    expect(failureKind(state('failed', http(403)))).toBe('signed-out')
  })

  test('a server this app cannot read is incompatible, not disconnected', () => {
    expect(failureKind(state('failed', new ConversationProtocolError('unknown event')))).toBe('incompatible')
    // The phone's engine drops the SDK error's class: only the message is left.
    expect(
      failureKind(state('failed', new Error('Bootstrap did not provide an authenticated conversation identity'))),
    ).toBe('incompatible')
    expect(failureKind(state('failed', http(426)))).toBe('incompatible')
    expect(failureKind(state('failed', new TypeError("undefined is not an object (evaluating 'session.csrfToken')")))).toBe(
      'incompatible',
    )
    expect(failureKind(state('failed', new Error('bootstrap response is missing required field csrfToken')))).toBe(
      'incompatible',
    )
  })

  test('phases that are not connection problems have no failure kind', () => {
    for (const phase of ['ready', 'running', 'completed', 'cancelled', 'connecting'] as const)
      expect(failureKind(state(phase))).toBeUndefined()
  })
})

describe('connectionNotice', () => {
  test('a disconnection offers Reconnect and keeps the technical text in details', () => {
    const notice = connectionNotice(state('failed', new Error('fetch failed: ECONNREFUSED')), describe_)
    expect(notice?.text).toBe("Can't connect to Theorem. Your draft is saved.")
    expect(notice?.text).not.toContain('ECONNREFUSED')
    expect(notice?.details).toContain('ECONNREFUSED')
    expect(notice?.action).toEqual({ recovery: 'reconnect', label: 'Reconnect' })
  })

  test('reconnecting still offers Reconnect', () => {
    expect(connectionNotice(state('reconnecting'), describe_)?.action?.recovery).toBe('reconnect')
  })

  test('a signed-out session offers Sign in again and not Reconnect', () => {
    for (const current of [state('authentication-required'), state('failed', http(401))]) {
      const notice = connectionNotice(current, describe_)
      expect(notice?.action).toEqual({ recovery: 'sign-in', label: 'Sign in again' })
    }
  })

  test('an incompatible server offers no action and says the server needs updating', () => {
    const notice = connectionNotice(state('failed', new ConversationProtocolError('x')), describe_)
    expect(notice?.action).toBeUndefined()
    expect(notice?.details).toContain('server needs updating')
  })

  test('no phase offers an action that cannot resolve it', () => {
    for (const phase of ['connecting', 'requires-action', 'cancelled', 'interrupted', 'running', 'ready'] as const) {
      expect(connectionNotice(state(phase), describe_)?.action).toBeUndefined()
    }
  })

  test('a running or ready conversation has no notice', () => {
    expect(connectionNotice(state('running'), describe_)).toBeUndefined()
    expect(connectionNotice(state('ready'), describe_)).toBeUndefined()
  })
})
