import { afterEach, expect, test } from 'bun:test'
import { observeHeight } from './display'

const root = document.documentElement
const original = globalThis.ResizeObserver

afterEach(() => {
  globalThis.ResizeObserver = original
  for (const key of ['scrollHeight', 'getBoundingClientRect'] as const)
    Reflect.deleteProperty(root, key)
  Reflect.deleteProperty(window, 'innerHeight')
})

/** Lays the frame out: how tall its content is, and how tall the frame is. */
function layout(content: number, frame: number) {
  Object.defineProperty(root, 'scrollHeight', {
    configurable: true,
    get: () => Math.max(content, frame),
  })
  Object.defineProperty(root, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ height: content }) as DOMRect,
  })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: frame })
}

test('a frame grows to its content and shrinks back when the content does', () => {
  let resized = () => {}
  globalThis.ResizeObserver = class {
    constructor(callback: () => void) {
      resized = callback
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  const reports: number[] = []
  // A first layout at a narrow width wraps every line, so the content is tall.
  layout(7962, 150)
  observeHeight((height) => reports.push(height))
  // The frame is now that tall, and the content settles at its real height.
  layout(1700, 7962)
  resized()
  expect(reports).toEqual([7962, 1700])
})
