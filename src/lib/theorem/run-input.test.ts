import { expect, mock, test } from 'bun:test'
import { createRunInputQueue, runInputReceipt } from './run-input'
import type { InputReceipt, RunInputHost } from './run-input'

const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
const receipt = (status: InputReceipt['status'] = 'queued', reason?: string): InputReceipt =>
  ({ inputId: 'input-1', text: 'Use the smaller design', status, ...(reason ? { reason } : {}) })

function harness() {
  const storage = new Map<string, string>()
  const local = { threadId: 'thread-1' as string | undefined, runId: 'run-1' as string | undefined, isRunning: true, isLoading: false, inputs: [] as InputReceipt[] }
  const durable = { active: true, runId: 'run-1' as string | undefined, inputs: [] as InputReceipt[] }
  const host: RunInputHost = {
    snapshot: () => local,
    refresh: mock(async () => durable),
    send: mock(async () => receipt()),
    receipts: mock(async () => [receipt('delivered')]),
    append: mock(() => {}),
    changed: mock(() => {}),
    describeError: (error) => error instanceof Error ? error.message : 'Request failed.',
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value) },
      removeItem: (key) => { storage.delete(key) },
    },
  }
  return { host, local, durable, storage, queue: createRunInputQueue(host) }
}

test('busy text goes to the same native run and waits for its delivery receipt', async () => {
  const h = harness()
  expect(h.queue.submit('Use the smaller design')).toBe(true)
  await settle()
  expect(h.host.send).toHaveBeenCalledTimes(1)
  const item = h.queue.getSnapshot()[0]!
  expect(h.host.send).toHaveBeenCalledWith('run-1', item.text, item.id)
  expect(item.state).toBe('queued')
  expect(h.host.append).not.toHaveBeenCalled()
  h.local.inputs = [receipt('delivered')]
  h.queue.observe()
  expect(h.queue.getSnapshot()).toEqual([])
  expect(h.storage.size).toBe(0)
})

test('input entered before the first run event waits for durable thread and run identities', async () => {
  const h = harness()
  h.local.threadId = undefined
  h.local.runId = undefined
  h.queue.submit('Use the smaller design')
  await settle()
  expect(h.host.send).not.toHaveBeenCalled()
  h.local.threadId = 'thread-1'
  h.queue.observe()
  await settle()
  expect(h.host.send).toHaveBeenCalledTimes(1)
  expect(h.queue.getSnapshot()[0]?.runId).toBe('run-1')
})

test('a chat that already has an id leaves input saved for a chat still being created', () => {
  const h = harness()
  h.storage.set(
    'theorem.run-input.pending:',
    JSON.stringify([{ id: 'early', text: 'Keep this aside', state: 'waiting' }]),
  )
  h.queue.observe()
  expect(h.queue.getSnapshot()).toEqual([])
  h.local.threadId = undefined
  h.queue.submit('Stays with this chat')
  expect(h.storage.get('theorem.run-input.pending:')).toContain('Keep this aside')
  expect(h.storage.get('theorem.run-input.thread-1')).toContain('Stays with this chat')
})

test('input accepted while a new chat is being created survives reload and moves to its durable id', async () => {
  const h = harness()
  h.local.threadId = undefined
  h.local.runId = undefined
  expect(h.queue.submit('Use the smaller design')).toBe(true)
  const saved = h.storage.get('theorem.run-input.pending:')
  expect(saved).toBeDefined()
  const pendingId = (JSON.parse(saved!) as Array<{ id: string; text: string }>)[0]
  expect(pendingId?.text).toBe('Use the smaller design')
  expect(h.storage.has('theorem.run-input.thread-1')).toBe(false)

  h.queue.dispose()
  const reloaded = createRunInputQueue(h.host)
  reloaded.observe()
  expect(reloaded.getSnapshot()[0]?.id).toBe(pendingId?.id)
  expect(reloaded.getSnapshot()[0]?.state).toBe('waiting')

  h.local.threadId = 'thread-1'
  h.local.runId = 'run-1'
  reloaded.observe()
  await settle()
  expect(h.storage.has('theorem.run-input.pending:')).toBe(false)
  expect(h.storage.get('theorem.run-input.thread-1')).toContain('Use the smaller design')
  expect(h.host.send).toHaveBeenCalledWith('run-1', 'Use the smaller design', pendingId?.id)
})

test('an ambiguous command response is not resent automatically and explicit retry keeps its identity', async () => {
  const h = harness()
  h.host.send = mock()
    .mockRejectedValueOnce(new TypeError('Network disconnected.'))
    .mockResolvedValueOnce(receipt())
  h.queue.submit('Use the smaller design')
  await settle()
  const saved = h.queue.getSnapshot()[0]!
  expect(saved.state).toBe('failed')
  h.queue.observe()
  h.queue.observe()
  await settle()
  expect(h.host.send).toHaveBeenCalledTimes(1)
  h.queue.retry(saved.id)
  await settle()
  expect(h.host.send).toHaveBeenNthCalledWith(2, 'run-1', saved.text, saved.id)
  expect(h.host.append).not.toHaveBeenCalled()
})

test('reload restores unknown outcomes without changing the original request key or run', async () => {
  const h = harness()
  h.host.send = mock(async () => { throw new TypeError('Reply lost.') })
  h.queue.submit('Use the smaller design')
  await settle()
  const saved = h.queue.getSnapshot()[0]!
  h.queue.dispose()
  h.host.send = mock(async () => receipt())
  const reloaded = createRunInputQueue(h.host)
  reloaded.observe()
  expect(reloaded.getSnapshot()[0]?.id).toBe(saved.id)
  expect(h.host.send).not.toHaveBeenCalled()
  reloaded.retry(saved.id)
  await settle()
  expect(h.host.send).toHaveBeenCalledWith('run-1', saved.text, saved.id)
})

test('closed input waits for both the observer and authoritative active/pending state to clear', async () => {
  const h = harness()
  h.host.send = mock(async () => { throw { body: { code: 'run_input_closed' } } })
  h.queue.submit('Use the smaller design')
  await settle()
  expect(h.queue.getSnapshot()[0]?.state).toBe('next')
  h.local.isRunning = false
  h.local.runId = undefined
  h.queue.observe()
  await settle()
  expect(h.host.append).not.toHaveBeenCalled()
  h.durable.active = false
  h.local.isRunning = true
  h.queue.observe()
  await settle()
  expect(h.host.append).not.toHaveBeenCalled()
  h.local.isRunning = false
  h.queue.observe()
  await settle()
  expect(h.host.append).toHaveBeenCalledTimes(1)
  expect(h.host.append).toHaveBeenCalledWith('Use the smaller design')
  expect(h.queue.getSnapshot()).toEqual([])
})

test('a delivered input found in terminal receipts never becomes a duplicate user turn', async () => {
  const h = harness()
  h.queue.submit('Use the smaller design')
  await settle()
  h.local.isRunning = false
  h.local.runId = undefined
  h.durable.active = false
  h.queue.observe()
  await settle()
  expect(h.host.receipts).toHaveBeenCalledWith('run-1')
  expect(h.queue.getSnapshot()).toEqual([])
  expect(h.host.append).not.toHaveBeenCalled()
})

test('a confirmed undelivered input becomes a normal next turn after settlement', async () => {
  const h = harness()
  h.host.receipts = mock(async () => [receipt('not_delivered', 'run_ended')])
  h.queue.submit('Use the smaller design')
  await settle()
  h.local.isRunning = false
  h.local.runId = undefined
  h.durable.active = false
  h.queue.observe()
  await settle()
  expect(h.host.append).toHaveBeenCalledTimes(1)
  expect(h.host.append).toHaveBeenCalledWith('Use the smaller design')
})

test('missing receipts and failed authoritative reads cannot authorize another send', async () => {
  const h = harness()
  h.host.receipts = mock(async () => [])
  h.queue.submit('Use the smaller design')
  await settle()
  h.local.isRunning = false
  h.local.runId = undefined
  h.durable.active = false
  h.queue.observe()
  await settle()
  expect(h.queue.getSnapshot()[0]?.state).toBe('queued')
  expect(h.host.append).not.toHaveBeenCalled()
  h.host.refresh = mock(async () => { throw new Error('Offline') })
  h.queue.observe()
  await settle()
  expect(h.host.append).not.toHaveBeenCalled()
})

test('Stop leaves undelivered text available without automatically starting another response', async () => {
  const h = harness()
  h.host.receipts = mock(async () => [receipt('not_delivered', 'run_cancelled')])
  h.queue.submit('Use the smaller design')
  await settle()
  h.local.isRunning = false
  h.local.runId = undefined
  h.durable.active = false
  h.queue.observe()
  await settle()
  expect(h.host.append).not.toHaveBeenCalled()
  const item = h.queue.getSnapshot()[0]!
  expect(item.state).toBe('failed')
  h.queue.retry(item.id)
  await settle()
  expect(h.host.append).toHaveBeenCalledTimes(1)
  expect(h.host.append).toHaveBeenCalledWith(item.text)
})

test('switching away while checking settlement does not append to a detached runtime', async () => {
  const h = harness()
  let finish!: (value: typeof h.durable) => void
  h.host.refresh = mock(() => new Promise<typeof h.durable>((resolve) => { finish = resolve }))
  h.local.runId = undefined
  h.local.isRunning = false
  h.queue.submit('Use the smaller design')
  h.queue.dispose()
  finish({ active: false, inputs: [], runId: undefined })
  await settle()
  expect(h.host.append).not.toHaveBeenCalled()
  expect(h.storage.size).toBe(1)
})

test('a closed retry after an unknown response reconciles the original command key before fallback', async () => {
  const h = harness()
  h.host.send = mock()
    .mockRejectedValueOnce(new TypeError('Reply lost.'))
    .mockRejectedValueOnce({ body: { code: 'run_input_closed' } })
  h.queue.submit('Use the smaller design')
  await settle()
  const item = h.queue.getSnapshot()[0]!
  h.host.receipts = mock(async () => [{ ...receipt('delivered'), requestKey: item.id }])
  h.local.isRunning = false
  h.local.runId = undefined
  h.durable.active = false
  h.queue.retry(item.id)
  await settle()
  expect(h.host.receipts).toHaveBeenCalledWith('run-1')
  expect(h.host.append).not.toHaveBeenCalled()
  expect(h.queue.getSnapshot()).toEqual([])
})

test('a queued command receipt cannot be treated as a confirmed refusal', async () => {
  const h = harness()
  h.host.send = mock(async () => { throw { body: { code: 'run_input_closed' } } })
  h.queue.submit('Use the smaller design')
  await settle()
  const item = h.queue.getSnapshot()[0]!
  h.host.receipts = mock(async () => [{ ...receipt(), requestKey: item.id }])
  h.local.isRunning = false
  h.local.runId = undefined
  h.durable.active = false
  h.queue.observe()
  await settle()
  expect(h.queue.getSnapshot()[0]?.state).toBe('queued')
  expect(h.host.append).not.toHaveBeenCalled()
})

test('a delivery seen before the POST acknowledgment is not downgraded by its queued receipt', async () => {
  const h = harness()
  let acknowledge!: (value: InputReceipt) => void
  h.host.send = mock(() => new Promise<InputReceipt>((resolve) => { acknowledge = resolve }))
  h.queue.submit('Use the smaller design')
  h.local.inputs = [receipt('delivered')]
  h.queue.observe()
  acknowledge(receipt())
  await settle()
  expect(h.queue.getSnapshot()).toEqual([])
  expect(h.host.append).not.toHaveBeenCalled()
})

test('Stop before the first run ID keeps input as an explicit next-turn choice', async () => {
  const h = harness()
  h.local.threadId = undefined
  h.local.runId = undefined
  h.queue.submit('Use the smaller design')
  h.queue.stop()
  h.local.threadId = 'thread-1'
  h.local.isRunning = false
  h.durable.active = false
  h.queue.observe()
  await settle()
  expect(h.host.send).not.toHaveBeenCalled()
  expect(h.host.append).not.toHaveBeenCalled()
  expect(h.queue.getSnapshot()[0]?.state).toBe('failed')
  h.queue.retry(h.queue.getSnapshot()[0]!.id)
  await settle()
  expect(h.host.append).toHaveBeenCalledWith('Use the smaller design')
})

test('malformed persisted data does not break the composer, and recoverable text is retained', async () => {
  for (const saved of ['not JSON', 'null', '{}', '[null, 5, {}]']) {
    const h = harness()
    h.storage.set('theorem.run-input.thread-1', saved)
    expect(() => h.queue.observe()).not.toThrow()
    expect(h.queue.submit('Fresh message')).toBe(true)
    await settle()
    expect(h.host.send).toHaveBeenCalledTimes(1)
  }
  const h = harness()
  h.storage.set('theorem.run-input.thread-1', JSON.stringify([{ text: 'Keep these recovered words', state: 'nonsense' }]))
  h.queue.observe()
  expect(h.queue.getSnapshot()[0]?.text).toBe('Keep these recovered words')
  expect(h.queue.getSnapshot()[0]?.state).toBe('failed')
  expect(h.host.send).not.toHaveBeenCalled()
})

test('restored pending input remains visible until this runtime actually displays its receipt', async () => {
  const h = harness()
  h.storage.set('theorem.run-input.thread-1', JSON.stringify([{ id: 'key-1', runId: 'run-1', inputId: 'input-1', text: 'Use the smaller design', state: 'queued', visible: true }]))
  h.queue.observe()
  expect(h.queue.getSnapshot()[0]?.visible).toBe(false)
  h.local.inputs = [receipt()]
  h.queue.observe()
  expect(h.queue.getSnapshot()[0]?.visible).toBe(true)
  h.local.inputs = []
  h.queue.observe()
  expect(h.queue.getSnapshot()[0]?.visible).toBe(false)
})

test('raw event decoding requires user_input and carries only the command receipt identity', () => {
  const part = { ...receipt(), type: 'user_input' }
  expect(runInputReceipt({ payload: { part }, idempotencyKey: 'chat-command:key-1' })?.requestKey).toBe('key-1')
  expect(runInputReceipt({ payload: { part: { ...part, type: 'text' } }, idempotencyKey: 'chat-command:key-1' })).toBeUndefined()
  expect(runInputReceipt({ payload: { part }, idempotencyKey: 'different-key' })?.requestKey).toBeUndefined()
})

test('a detached queue cannot overwrite the replacement queue after a delayed command ACK', async () => {
  const h = harness()
  let acknowledge!: (value: InputReceipt) => void
  h.host.send = mock(() => new Promise<InputReceipt>((resolve) => { acknowledge = resolve }))
  h.queue.submit('Use the smaller design')
  h.queue.dispose()
  h.host.send = mock(async (_runId, text) => ({ ...receipt(), inputId: 'input-2', text }))
  const replacement = createRunInputQueue(h.host)
  replacement.observe()
  replacement.submit('Also preserve the original colors')
  await settle()
  const stored = [...h.storage.values()]
  acknowledge(receipt())
  await settle()
  expect([...h.storage.values()]).toEqual(stored)
  expect(replacement.getSnapshot()).toHaveLength(2)
})

test('a detached queue cannot erase replacement recovery state after a delayed receipt read', async () => {
  const h = harness()
  h.queue.submit('Use the smaller design')
  await settle()
  let finishReceipts!: (value: InputReceipt[]) => void
  h.host.receipts = mock(() => new Promise<InputReceipt[]>((resolve) => { finishReceipts = resolve }))
  h.local.isRunning = false
  h.local.runId = undefined
  h.durable.active = false
  h.queue.observe()
  await settle()
  h.queue.dispose()
  h.local.isRunning = true
  h.local.runId = 'run-2'
  h.durable.active = true
  h.durable.runId = 'run-2'
  h.host.send = mock(async (_runId, text) => ({ ...receipt(), inputId: 'input-2', text }))
  const replacement = createRunInputQueue(h.host)
  replacement.observe()
  replacement.submit('Also preserve the original colors')
  await settle()
  const stored = [...h.storage.values()]
  finishReceipts([receipt('delivered')])
  await settle()
  expect([...h.storage.values()]).toEqual(stored)
  expect(replacement.getSnapshot()).toHaveLength(2)
})
