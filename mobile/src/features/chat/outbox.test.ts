// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import type { ConversationState } from '@theoremharness/sdk'
import { ConversationBinding, type Conversation } from './binding'
import { Outbox } from './outbox'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function harness(options: { refuse?: string[] } = {}) {
  const calls: string[] = []
  const detaches: string[] = []
  const listeners = new Set<(state: ConversationState) => void>()
  let state: ConversationState = { phase: 'ready' }
  const conversation: Conversation = {
    get state() {
      return state
    },
    subscribe(listener) {
      listeners.add(listener)
      // Like the SDK's HeadlessConversation.subscribe: the listener hears the current state at once.
      listener(state)
      return () => listeners.delete(listener)
    },
    async connect() {},
    async observe() {},
    detach() {
      detaches.push('detach')
    },
    async send(id, request) {
      calls.push(`send:${id}:${request.text}`)
      if (options.refuse?.includes(request.text)) throw new Error('refused')
      // An admitted message starts a run, as the real conversation does.
      state = { phase: 'running' }
      for (const listener of listeners) listener(state)
    },
    async stop(id) {
      calls.push(`stop:${id}`)
    },
  }
  let n = 0
  const binding = new ConversationBinding({ create: () => conversation, newId: () => `cmd-${++n}` })
  const outbox = new Outbox({ binding, newId: () => `msg-${++n}` })
  const phase = (next: ConversationState['phase']) => {
    state = { phase: next }
    for (const listener of listeners) listener(state)
  }
  return { calls, detaches, outbox, phase }
}

describe('Outbox', () => {
  test('a message sent while free goes under the id it was admitted with', async () => {
    const { calls, outbox } = harness()
    const id = outbox.submit('th', 'hello')
    await settle()
    expect(calls).toEqual([`send:${id}:hello`])
  })

  test('a message sent during a run waits, then goes once, under its original id', async () => {
    const { calls, outbox, phase } = harness()
    phase('running')
    const id = outbox.submit('th', 'later')
    await settle()
    expect(calls).toEqual([])
    expect(outbox.snapshot('th').items.map((item) => item.id)).toEqual([id])

    phase('completed')
    await settle()
    expect(calls).toEqual([`send:${id}:later`])
    expect(outbox.snapshot('th').items).toEqual([])
    // Another update of the same phase never sends it again.
    phase('completed')
    await settle()
    expect(calls).toEqual([`send:${id}:later`])
  })

  test('Stop cancels the run, pauses the queue, and the next send releases it in order', async () => {
    const { calls, outbox, phase } = harness()
    phase('running')
    const first = outbox.submit('th', 'one')
    await outbox.stop('th')
    expect(calls.filter((call) => call.startsWith('stop:'))).toHaveLength(1)
    phase('cancelled')
    await settle()
    expect(calls.filter((call) => call.startsWith('send:'))).toEqual([])

    const second = outbox.submit('th', 'two')
    await settle()
    expect(calls.filter((call) => call.startsWith('send:'))).toEqual([`send:${first}:one`])
    phase('completed')
    await settle()
    expect(calls.filter((call) => call.startsWith('send:'))).toEqual([`send:${first}:one`, `send:${second}:two`])
  })

  test('a removed message is never sent', async () => {
    const { calls, outbox, phase } = harness()
    phase('running')
    const id = outbox.submit('th', 'oops')
    expect(outbox.remove('th', id)).toBe(true)
    phase('completed')
    await settle()
    expect(calls).toEqual([])
  })

  test('a refusal comes back with its words and is not retried', async () => {
    const { calls, outbox } = harness({ refuse: ['bad'] })
    const id = outbox.submit('th', 'bad')
    await settle()
    expect(calls).toEqual([`send:${id}:bad`])
    const [refusal] = outbox.snapshot('th').refused
    expect(refusal?.message).toEqual({ id, text: 'bad' })
    outbox.acknowledge('th', id)
    await settle()
    expect(outbox.snapshot('th').refused).toEqual([])
    expect(calls).toEqual([`send:${id}:bad`])
  })

  test('holding a queued message keeps observation, and finishing hands it back without stopping anything', async () => {
    const { calls, detaches, outbox, phase } = harness()
    phase('running')
    outbox.submit('th', 'x')
    await settle()
    expect(detaches).toEqual([])
    phase('completed')
    await settle()
    await settle()
    expect(calls.some((call) => call.startsWith('stop:'))).toBe(false)
    expect(detaches).toEqual(['detach'])
  })
})
