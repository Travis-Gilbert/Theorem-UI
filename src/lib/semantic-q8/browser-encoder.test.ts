import { expect, test } from 'bun:test'
import { createBrowserEncoder } from './browser-encoder'
import { createEncodeQueue } from './encode-queue'
import type { Q8Reply, Q8Request } from './encoder-protocol'

const query = {
  input_kind: 'text',
  task: 'search_query',
  text: 'climate policy',
} as const
const identity = {
  model_id: 'model',
  checkpoint_digest: 'checkpoint',
  semantic_space_id: 'space',
  producer_revision: 'producer',
}

class Port extends EventTarget {
  ended = false
  requests: Q8Request[] = []
  postMessage(message: Q8Request) {
    this.requests.push(message)
  }
  terminate() {
    this.ended = true
  }
  reply(message: Q8Reply) {
    this.dispatchEvent(new MessageEvent('message', { data: message }))
  }
}

test('the first query starts one worker and resumes on its original encode', async () => {
  const ports: Port[] = []
  const encoder = createBrowserEncoder(() => {
    const port = new Port()
    ports.push(port)
    return port
  })
  try {
    expect(ports).toHaveLength(0)
    const signal = new AbortController().signal
    const first = encoder.encode(query, signal)
    const second = encoder.encode({ ...query, text: 'ocean heat' }, signal)
    expect(ports).toHaveLength(1)
    const port = ports[0]!
    expect(port.requests).toEqual([
      { type: 'encode', id: 1, input: query },
      {
        type: 'encode',
        id: 2,
        input: { ...query, text: 'ocean heat' },
      },
    ])
    expect(encoder.ready).toBe(false)
    const vector = new Float32Array([1])
    port.reply({ type: 'ready', identity })
    port.reply({ type: 'encoded', id: 1, vector })
    port.reply({ type: 'encoded', id: 2, vector })
    expect(await first).toEqual({ identity, vector })
    expect(await second).toEqual({ identity, vector })
    expect(encoder.ready).toBe(true)
    const warm = encoder.encode(query, signal)
    port.reply({ type: 'encoded', id: 3, vector })
    expect(await warm).toEqual({ identity, vector })
    expect(ports).toHaveLength(1)
  } finally {
    encoder.close()
  }
})

test('cancellation detaches only that query; a failed boot is retried on a later query', async () => {
  const firstPort = new Port()
  const retryPort = new Port()
  let starts = 0
  const encoder = createBrowserEncoder(() =>
    starts++ === 0 ? firstPort : retryPort,
  )
  try {
    const controller = new AbortController()
    const first = encoder.encode(query, controller.signal)
    const signal = new AbortController().signal
    const waiter = encoder.encode(query, signal)
    controller.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(firstPort.requests.at(-1)).toEqual({ type: 'cancel', id: 1 })
    expect(firstPort.ended).toBe(false)

    firstPort.reply({ type: 'unavailable', code: 'checkpoint_mismatch' })
    await expect(waiter).rejects.toMatchObject({ code: 'checkpoint_mismatch' })
    expect(firstPort.ended).toBe(true)

    const retry = encoder.encode(query, signal)
    retryPort.reply({ type: 'ready', identity })
    retryPort.reply({ type: 'encoded', id: 3, vector: new Float32Array([1]) })
    expect((await retry).identity).toEqual(identity)
    expect(starts).toBe(2)
  } finally {
    encoder.close()
  }
})

test('canceling the only cold query aborts the pending model load', async () => {
  const port = new Port()
  const encoder = createBrowserEncoder(() => port)
  try {
    const controller = new AbortController()
    const outcome = encoder.encode(query, controller.signal)
    controller.abort()
    await expect(outcome).rejects.toMatchObject({ name: 'AbortError' })
    expect(port.ended).toBe(true)
  } finally {
    encoder.close()
  }
})

test('foreground searches overtake waiting indexing and canceled work is dropped', async () => {
  const first = Promise.withResolvers<void>()
  const drained = Promise.withResolvers<void>()
  const ran: number[] = []
  const queue = createEncodeQueue(async ({ id }) => {
    ran.push(id)
    if (id === 1) await first.promise
    if (id === 2) drained.resolve()
  })
  queue.add({ id: 1, foreground: false })
  queue.add({ id: 2, foreground: false })
  queue.add({ id: 3, foreground: true })
  queue.add({ id: 4, foreground: true })
  queue.cancel(3)
  first.resolve()
  await drained.promise
  expect(ran).toEqual([1, 4, 2])
})
