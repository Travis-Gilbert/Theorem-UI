import { afterEach, expect, spyOn, test } from 'bun:test'
import type { Mock } from 'bun:test'
import { observeHeight } from './display'

const page = document.documentElement
let box: Mock<() => DOMRect> | undefined

/** The page as a frame of `frame` px sees it, with content `height` px tall. */
function measured({
  scroll,
  frame,
  height,
}: {
  scroll: number
  frame: number
  height: number
}) {
  Object.defineProperty(page, 'scrollHeight', {
    configurable: true,
    value: scroll,
  })
  Object.defineProperty(page, 'clientHeight', {
    configurable: true,
    value: frame,
  })
  box = spyOn(page, 'getBoundingClientRect').mockReturnValue({
    height,
  } as DOMRect)
  const heights: Array<number> = []
  observeHeight((reported) => heights.push(reported))
  return heights
}

afterEach(() => {
  delete (page as { scrollHeight?: number }).scrollHeight
  delete (page as { clientHeight?: number }).clientHeight
  box?.mockRestore()
})

test('a page with a fractional height gets the whole pixel above it', () => {
  // scrollHeight rounds 186.375 down; the frame would scroll for the rest.
  expect(measured({ scroll: 186, frame: 186, height: 186.375 })).toEqual([187])
})

test('a page that got shorter than its frame lets the frame shrink', () => {
  // scrollHeight reads the frame's 187 however short the page is.
  expect(measured({ scroll: 187, frame: 187, height: 153.2 })).toEqual([154])
})

test('content overflowing the page box still counts', () => {
  expect(measured({ scroll: 400, frame: 186, height: 186 })).toEqual([400])
})
