// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import { destinationOf, settle, type Invocation } from './route'

const call = (name: string, params: Record<string, unknown> = {}, id = name): Invocation => ({ id, name, params })

describe('a system action', () => {
  test('capture opens intake at the camera', () => {
    expect(destinationOf(call('captureForConversation'), undefined)).toEqual({
      pathname: '/intake',
      params: { from: 'camera' },
    })
  })

  test('share carries its note, and no note is no text', () => {
    expect(destinationOf(call('shareIntoConversation', { note: ' Compare this ' }), undefined)).toEqual({
      pathname: '/intake',
      params: { text: ' Compare this ' },
    })
    expect(destinationOf(call('shareIntoConversation', { note: 3 }), undefined)).toEqual({
      pathname: '/intake',
      params: {},
    })
  })

  test('continue opens the last conversation, or the list when there is none', () => {
    expect(destinationOf(call('continueConversation'), 't1')).toEqual({
      pathname: '/chat/[threadId]',
      params: { threadId: 't1' },
    })
    expect(destinationOf(call('continueConversation'), undefined)).toEqual({ pathname: '/chat' })
  })

  test('an unknown action opens nothing but is still cleared', () => {
    expect(settle([call('startTaskOnMac')], 't1')).toEqual({ open: undefined, remove: ['startTaskOnMac'] })
  })

  test('several waiting actions open one screen, the newest, and all are cleared', () => {
    const result = settle(
      [call('continueConversation', {}, 'a'), call('nonsense', {}, 'b'), call('captureForConversation', {}, 'c')],
      't1',
    )
    expect(result.open).toEqual({ pathname: '/intake', params: { from: 'camera' } })
    expect(result.remove).toEqual(['a', 'b', 'c'])
  })
})
