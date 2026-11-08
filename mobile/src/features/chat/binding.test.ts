// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import type { ConversationState } from '@theoremharness/sdk'
import { ConversationBinding, type Conversation } from './binding'

type Call = string

function fakeConversation(calls: Call[], live = true): Conversation {
  let state: ConversationState = { phase: 'detached' }
  return {
    get state() {
      return state
    },
    subscribe: () => () => {},
    async connect() {
      calls.push('connect')
      state = {
        phase: live ? 'running' : 'ready',
        journal: {
          schema: 'theorem-sdk-conversation/1',
          identity: { authority: 'a', tenantId: 't', principalId: 'p', threadId: 'th' },
          pending: [],
          events: [],
          ...(live ? { runId: 'run-1' } : {}),
        },
        projection: live
          ? ({ phase: 'running', parts: [], terminal: false } as unknown as ConversationState['projection'])
          : undefined,
      }
    },
    async observe() {
      calls.push('observe')
      await new Promise(() => {}) // a live run keeps streaming
    },
    detach() {
      calls.push('detach')
    },
    async send(id, request) {
      calls.push(`send:${id}:${request.text}`)
    },
    async stop(id) {
      calls.push(`stop:${id}`)
    },
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function binding(calls: Call[], live = true) {
  let n = 0
  return new ConversationBinding({
    create: () => fakeConversation(calls, live),
    newId: () => `cmd-${++n}`,
  })
}

describe('ConversationBinding', () => {
  test('the first lease connects and follows the live run', async () => {
    const calls: Call[] = []
    binding(calls).retain('th')
    await settle()
    expect(calls).toEqual(['connect', 'observe'])
  })

  test('releasing the last view detaches and never stops the run', async () => {
    const calls: Call[] = []
    const lease = binding(calls).retain('th')
    await settle()
    lease.release()
    lease.release() // a second unmount callback is harmless
    expect(calls).toEqual(['connect', 'observe', 'detach'])
    expect(calls.some((call) => call.startsWith('stop'))).toBe(false)
  })

  test('a second view shares the session; only the last release detaches', async () => {
    const calls: Call[] = []
    const shared = binding(calls)
    const first = shared.retain('th')
    const second = shared.retain('th')
    await settle()
    first.release()
    expect(calls).toEqual(['connect', 'observe'])
    second.release()
    expect(calls).toEqual(['connect', 'observe', 'detach'])
  })

  test('backgrounding detaches without stopping, and foregrounding reconnects', async () => {
    const calls: Call[] = []
    const shared = binding(calls)
    shared.retain('th')
    await settle()
    shared.suspend()
    expect(calls).toEqual(['connect', 'observe', 'detach'])
    shared.resume()
    await settle()
    expect(calls).toEqual(['connect', 'observe', 'detach', 'connect', 'observe'])
    expect(calls.some((call) => call.startsWith('stop'))).toBe(false)
  })

  test('stop is explicit and carries its own command id', async () => {
    const calls: Call[] = []
    const lease = binding(calls).retain('th')
    await settle()
    await lease.stop()
    expect(calls).toContain('stop:cmd-1')
    expect(calls).not.toContain('detach')
  })

  test('each send gets a fresh command id and then follows the admitted run', async () => {
    const calls: Call[] = []
    const lease = binding(calls, false).retain('th')
    await settle()
    await lease.send('hello')
    await lease.send('again')
    expect(calls).toEqual(['connect', 'send:cmd-1:hello', 'send:cmd-2:again'])
  })
})
