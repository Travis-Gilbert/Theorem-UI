// SOURCING: bun:test over the field's mount. textmode.js needs WebGL2, which
// happy-dom has not got, so its create is spied on and answered with a fake that
// keeps the two behaviours at stake: it still calls setup after destroy, and
// resizing a destroyed instance throws.
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { textmode } from 'textmode.js'
import type { Textmodifier } from 'textmode.js'
import { useLifeCounts } from '@/lib/life/store'
import { mountLife } from './mount-life'

let setup: () => void
let disposed = false
let createSpy: ReturnType<typeof spyOn>

const fake = {
  layers: { add: () => ({ draw() {} }) },
  grid: { cols: 8, rows: 8 },
  setup: (callback: () => void) => {
    setup = callback
  },
  draw() {},
  pixelDensity() {
    if (disposed)
      throw new TypeError("Cannot read properties of undefined (reading 'Xh')")
  },
  get isDisposed() {
    return disposed
  },
  destroy() {
    disposed = true
  },
}

beforeEach(() => {
  disposed = false
  useLifeCounts.setState({ generation: -1, population: -1, pace: -1 })
  createSpy = spyOn(textmode, 'create').mockImplementation(
    () => fake as unknown as Textmodifier,
  )
})
afterEach(() => createSpy.mockRestore())

test('a live field sets up and publishes its counts', () => {
  mountLife(document.createElement('div'), { reducedMotion: true })

  setup()

  expect(useLifeCounts.getState().population).toBeGreaterThanOrEqual(0)
})

test('a field destroyed while textmode.js loads does nothing when setup arrives', () => {
  const field = mountLife(document.createElement('div'), {
    reducedMotion: true,
  })
  field.destroy()

  expect(() => setup()).not.toThrow()

  expect(useLifeCounts.getState().population).toBe(-1)
})
