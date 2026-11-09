import { afterEach, expect, test } from 'bun:test'
import { markSelectedCell, observeHeight } from './display'

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

test('only the cell a selection names is marked, and a selection outside every cell marks none', () => {
  document.body.innerHTML =
    '<main><div class="cell" data-cell-id="a"></div><div class="cell" data-cell-id="b"></div></main>'
  const [a, b] = document.querySelectorAll('.cell')
  const marked = () =>
    [...document.querySelectorAll('[data-selected]')].map((cell) =>
      cell.getAttribute('data-cell-id'),
    )
  markSelectedCell(a)
  expect(marked()).toEqual(['a'])
  markSelectedCell(b)
  expect(marked()).toEqual(['b'])
  markSelectedCell(null)
  expect(marked()).toEqual([])
  document.body.innerHTML = ''
})
