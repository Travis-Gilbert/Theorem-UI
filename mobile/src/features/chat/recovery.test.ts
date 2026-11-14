// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import { ConversationProtocolError, type ConversationState } from '@theoremharness/sdk'
import { connectionNotice, failureKind, isWorking, waitingSend } from './recovery'

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

  test("a TypeError from the app's own code is not blamed on the server", () => {
    // Seen live: the journal could not write a bigint, and the notice said the server needed updating.
    expect(failureKind(state('failed', new TypeError('Do not know how to serialize a BigInt')))).toBe('disconnected')
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

describe('isWorking', () => {
  test('a send waiting in the journal after a failed start is not Working', () => {
    // Seen live: the run could not start, the notice said so, and Working with Stop stayed up.
    for (const phase of ['failed', 'authentication-required', 'detached'] as const)
      expect(isWorking(state(phase), true)).toBe(false)
  })

  test('a run in progress, reconnecting or just sent is Working', () => {
    for (const phase of ['running', 'reconnecting', 'ready', 'connecting'] as const)
      expect(isWorking(state(phase), true)).toBe(true)
  })

  test('nothing is Working when the view says nothing runs', () => {
    expect(isWorking(state('running'), false)).toBe(false)
  })
})

describe('waitingSend', () => {
  const pending = (...commands: { id: string; kind: 'send' | 'edit' | 'retry' | 'command'; cancelRequested?: boolean }[]) =>
    ({
      phase: 'failed',
      journal: { pending: commands.map((command) => ({ cancelRequested: false, ...command })) },
    }) as unknown as Pick<ConversationState, 'phase' | 'journal'>

  test('a send that has not reached Theorem can be stopped, though nothing is Working', () => {
    // Seen by the re-walk: the start failed, Working was hidden, and with it the only way to stop the send.
    const state = pending({ id: 'a', kind: 'send' })
    expect(isWorking(state, true)).toBe(false)
    expect(waitingSend(state)).toBe(true)
  })

  test('an edit or retry that is waiting counts as well', () => {
    expect(waitingSend(pending({ id: 'a', kind: 'edit' }))).toBe(true)
    expect(waitingSend(pending({ id: 'a', kind: 'retry' }))).toBe(true)
  })

  test('a send already stopped is not offered Stop again', () => {
    expect(waitingSend(pending({ id: 'a', kind: 'send', cancelRequested: true }))).toBe(false)
  })

  test('a waiting run command alone is not a send to stop', () => {
    expect(waitingSend(pending({ id: 'a:cancel', kind: 'command' }))).toBe(false)
  })

  test('nothing waiting, or no journal yet, offers nothing', () => {
    expect(waitingSend(pending())).toBe(false)
    expect(waitingSend({ phase: 'detached' })).toBe(false)
  })

  test('a send that is on its way is Working, so Stop is the usual one', () => {
    expect(waitingSend({ ...pending({ id: 'a', kind: 'send' }), phase: 'running' })).toBe(false)
  })
})
