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

  describe('observation across reconnects', () => {
    /**
     * Like HeadlessConversation: connect() detaches first, detach aborts the observer, and
     * observe() only returns once its stream has actually closed, a moment after the abort.
     */
    function streaming(calls: Call[], closeAfterMs = 5): Conversation {
      const inner = fakeConversation(calls)
      let generation = 0
      let closing: Array<() => void> = []
      return {
        ...inner,
        get state() {
          return inner.state
        },
        async connect() {
          this.detach()
          await inner.connect()
        },
        async observe() {
          calls.push('observe')
          const mine = generation
          await new Promise<void>((resolve) => {
            const poll = () => (generation !== mine ? setTimeout(resolve, closeAfterMs) : closing.push(poll))
            closing.push(poll)
          })
        },
        detach() {
          calls.push('detach')
          generation += 1
          const waiting = closing
          closing = []
          for (const poll of waiting) poll()
        },
      }
    }

    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    test('Reconnect while a stream is open starts a new one once the old one has closed', async () => {
      const calls: Call[] = []
      const shared = new ConversationBinding({ create: () => streaming(calls), newId: () => 'cmd' })
      shared.retain('th')
      await pause(20)
      shared.reconnect('th')
      await pause(40)
      expect(calls.filter((call) => call === 'observe')).toHaveLength(2)
    })

    test('an old stream closing late does not make the next send open a second one', async () => {
      const calls: Call[] = []
      const shared = new ConversationBinding({ create: () => streaming(calls, 30), newId: () => 'cmd' })
      const lease = shared.retain('th')
      await pause(20)
      shared.suspend()
      shared.resume()
      await pause(50) // the new stream is open; the first one has finished closing
      await lease.send('hello')
      await pause(60)
      expect(calls.filter((call) => call === 'observe')).toHaveLength(2)
    })
  })
})
