// SOURCING: bun:test over the work event stream's subscription (parsing, reconnect with a resync, stopping), against a stand-in EventSource
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { subscribeToEvents } from './source'
import type { WorkSignal } from './source'

type Listener = (message: { data: string }) => void

class FakeEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  readyState = FakeEventSource.OPEN
  closed = false
  private listeners = new Map<string, Listener[]>()
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  close() {
    this.closed = true
    this.readyState = FakeEventSource.CLOSED
  }
  emit(type: string, data: string) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data })
  }
  /** The browser gives up: the connection is closed and `error` fires. */
  fail() {
    this.readyState = FakeEventSource.CLOSED
    this.emit('error', '')
  }
}

const realEventSource = globalThis.EventSource
const realSetTimeout = globalThis.setTimeout
const realClearTimeout = globalThis.clearTimeout
let opened: FakeEventSource[]
let timers: Array<{ run: () => void; delay: number; cleared: boolean }>

beforeEach(() => {
  opened = []
  timers = []
  Object.assign(globalThis, {
    EventSource: FakeEventSource,
    setTimeout: (run: () => void, delay: number) => {
      const timer = { run, delay, cleared: false }
      timers.push(timer)
      return timer
    },
    clearTimeout: (timer?: { cleared: boolean }) => {
      if (timer) timer.cleared = true
    },
  })
})
afterEach(() => {
  Object.assign(globalThis, {
    EventSource: realEventSource,
    setTimeout: realSetTimeout,
    clearTimeout: realClearTimeout,
  })
})

const open = (url: string) => {
  const source = new FakeEventSource(url)
  opened.push(source)
  return source as unknown as EventSource
}

describe('the work event stream', () => {
  test('one connection to /events; each frame is delivered as its event', () => {
    const got: WorkSignal[] = []
    subscribeToEvents((signal) => got.push(signal), open)
    expect(opened).toHaveLength(1)
    expect(opened[0]!.url).toBe('/api/work/v1/events')

    opened[0]!.emit('work.item.deleted', JSON.stringify({ id: '7' }))
    opened[0]!.emit('work.sync', JSON.stringify({ sync: { state: 'running' } }))
    expect(got).toEqual([
      { type: 'work.item.deleted', id: '7' },
      { type: 'work.sync', sync: { state: 'running' } },
    ])
  })

  test('a frame that is not JSON is skipped and the next one still arrives', () => {
    const got: WorkSignal[] = []
    subscribeToEvents((signal) => got.push(signal), open)
    opened[0]!.emit('work.item.deleted', 'not json')
    opened[0]!.emit('work.item.deleted', JSON.stringify({ id: '8' }))
    expect(got).toEqual([{ type: 'work.item.deleted', id: '8' }])
  })

  test('an error while the browser is still retrying is left to it', () => {
    subscribeToEvents(() => undefined, open)
    opened[0]!.readyState = FakeEventSource.CONNECTING
    opened[0]!.emit('error', '')
    expect(timers).toHaveLength(0)
    expect(opened[0]!.closed).toBe(false)
  })

  test('a connection the browser gave up on is reopened after a growing delay, asking for a resync', () => {
    const got: WorkSignal[] = []
    subscribeToEvents((signal) => got.push(signal), open)

    opened[0]!.fail()
    expect(opened[0]!.closed).toBe(true)
    expect(timers.map((t) => t.delay)).toEqual([1_000])
    timers[0]!.run()
    expect(opened).toHaveLength(2)
    expect(got).toEqual([{ type: 'work.resync' }])

    opened[1]!.fail()
    expect(timers.map((t) => t.delay)).toEqual([1_000, 2_000])

    // A connection that opens resets the delay.
    timers[1]!.run()
    opened[2]!.emit('open', '')
    opened[2]!.fail()
    expect(timers.at(-1)!.delay).toBe(1_000)
  })

  test('stopping closes the connection and cancels a pending reconnect', () => {
    const stop = subscribeToEvents(() => undefined, open)
    opened[0]!.fail()
    stop()
    expect(timers[0]!.cleared).toBe(true)

    const second = subscribeToEvents(() => undefined, open)
    second()
    expect(opened[1]!.closed).toBe(true)
  })
})
