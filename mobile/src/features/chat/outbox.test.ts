// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import type { ConversationState } from '@theoremharness/sdk'
import { ConversationBinding, type Conversation } from './binding'
import { Outbox } from './outbox'
import type { OutboxStore } from './outbox-store'
import type { QueuedMessage } from './queue'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** An in-memory stand-in for the SQLite store, so persistence is testable here. */
function memoryStore(): OutboxStore & { data: Map<string, { items: QueuedMessage[]; paused: boolean }> } {
  const data = new Map<string, { items: QueuedMessage[]; paused: boolean }>()
  return {
    data,
    load: () =>
      [...data]
        .map(([threadId, { items, paused }]) => ({ threadId, items, paused }))
        .filter((entry) => entry.items.length > 0 || entry.paused),
    save: (threadId, items, paused) => void data.set(threadId, { items, paused }),
    clear: () => data.clear(),
  }
}

function harness(options: { refuse?: string[]; uncertain?: string[]; store?: OutboxStore } = {}) {
  const calls: string[] = []
  const detaches: string[] = []
  const listeners = new Set<(state: ConversationState) => void>()
  let state: ConversationState = { phase: 'ready' }
  const conversation: Conversation = {
    get state() {
      return state
    },
    // As HeadlessConversation does: a new subscriber hears the current state at once.
    subscribe(listener) {
      listeners.add(listener)
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
      // A definite refusal, shaped as the SDK's isDefiniteRefusal reads it.
      if (options.refuse?.includes(request.text)) throw { statusCode: 422, body: { code: 'invalid_request' } }
      // An uncertain failure: no answer, so the outcome is unknown.
      if (options.uncertain?.includes(request.text)) throw new Error('lost response')
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
  const outbox = new Outbox({ binding, newId: () => `msg-${++n}`, store: options.store })
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

  test('a message sent after a run finished goes, though the outbox last saw it running', async () => {
    const { calls, outbox, phase } = harness()
    const first = outbox.submit('th', 'one')
    await settle()
    phase('completed')
    await settle()
    const second = outbox.submit('th', 'two')
    await settle()
    expect(calls).toEqual([`send:${first}:one`, `send:${second}:two`])
    expect(outbox.snapshot('th').inflight).toBeUndefined()
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
    // The outbox holds the lease until the run its send started settles.
    phase('completed')
    await settle()
    expect(calls.some((call) => call.startsWith('stop:'))).toBe(false)
    expect(detaches).toEqual(['detach'])
  })

  test('an uncertain send keeps its id out of the composer and retries under the same id', async () => {
    const { calls, outbox } = harness({ uncertain: ['lost'] })
    const id = outbox.submit('th', 'lost')
    await settle()
    expect(calls).toEqual([`send:${id}:lost`])
    const snap = outbox.snapshot('th')
    expect(snap.refused).toEqual([])
    expect(snap.paused).toBe(true)
    expect(snap.items.map((item) => item.id)).toEqual([id])
    expect(snap.items[0]?.uncertain).toBe(true)
    // A new send re-arms and retries the uncertain message first, under its ORIGINAL id.
    const second = outbox.submit('th', 'next')
    await settle()
    expect(calls).toEqual([`send:${id}:lost`, `send:${id}:lost`])
    expect(outbox.snapshot('th').items.map((item) => item.id)).toEqual([id, second])
  })

  test('a queued message is saved durably before submit returns', () => {
    const store = memoryStore()
    const { outbox, phase } = harness({ store })
    phase('running')
    const id = outbox.submit('th', 'kept')
    // Synchronous: the words are already kept, so the caller may clear the draft.
    expect(store.load()).toEqual([{ threadId: 'th', items: [{ id, text: 'kept' }], paused: false }])
  })

  test('the dispatched message stays durable until its send resolves', async () => {
    const store = memoryStore()
    const { outbox } = harness({ store })
    const id = outbox.submit('th', 'going')
    // While the send is in flight the row is kept: a termination here loses nothing.
    expect(store.load()[0]?.items.map((item) => item.id)).toEqual([id])
    await settle()
    // Once the send resolves the SDK journal owns it; the row goes.
    expect(store.load()).toEqual([])
  })

  test('a failed save on submit keeps the draft and leaves nothing inflight', () => {
    const store = memoryStore()
    store.save = () => {
      throw new Error('disk full')
    }
    const { outbox } = harness({ store })
    expect(() => outbox.submit('th', 'words')).toThrow('disk full')
    // Nothing was published: no inflight message that no completion can clear.
    expect(outbox.snapshot('th').inflight).toBeUndefined()
    expect(outbox.snapshot('th').items).toEqual([])
  })

  test('waiting messages survive termination and return under their original ids', async () => {
    const store = memoryStore()
    store.save(
      'th',
      [
        { id: 'saved-1', text: 'one' },
        { id: 'saved-2', text: 'two' },
      ],
      false,
    )
    const { calls, outbox, phase } = harness({ store })
    await settle()
    expect(calls).toEqual(['send:saved-1:one'])
    expect(outbox.snapshot('th').items.map((item) => item.id)).toEqual(['saved-2'])
    phase('completed')
    await settle()
    expect(calls).toEqual(['send:saved-1:one', 'send:saved-2:two'])
  })

  test('a Stop pause survives termination and blocks automatic dispatch', async () => {
    const store = memoryStore()
    const { outbox, phase } = harness({ store })
    phase('running')
    const id = outbox.submit('th', 'stopped')
    await outbox.stop('th')
    expect(store.load()).toEqual([{ threadId: 'th', items: [{ id, text: 'stopped' }], paused: true }])

    // A relaunch restores the pause: an idle conversation does not send on its own.
    const relaunched = harness({ store })
    await settle()
    expect(relaunched.calls).toEqual([])
    expect(relaunched.outbox.snapshot('th').paused).toBe(true)
    // An explicit send re-arms and the stopped message goes under its original id.
    relaunched.outbox.submit('th', 'again')
    await settle()
    expect(relaunched.calls.filter((call) => call.startsWith('send:'))).toEqual([`send:${id}:stopped`])
  })

  test('signing out clears the saved queue', () => {
    const store = memoryStore()
    const { outbox, phase } = harness({ store })
    phase('running')
    outbox.submit('th', 'x')
    outbox.reset()
    expect(store.load()).toEqual([])
  })
})
