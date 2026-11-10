// SOURCING: bun:test over the SVG an App's picture is drawn from
// (app-picture.ts). DOMPurify runs over jsdom's window here, as in
// snapshots.test.ts: happy-dom's parser hands it a snapshot's styles apart.
import { describe, expect, test } from 'bun:test'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { MAX_PICTURE_BASE64, fitsATurn, pictureSvg } from './app-picture'

const purify = createDOMPurify(new JSDOM('').window)

/** The SVG as a document, which fails to parse unless it is well-formed XML. */
function parsed(svg: string): Document {
  const page = new DOMParser().parseFromString(svg, 'image/svg+xml')
  expect(page.querySelector('parsererror')).toBeNull()
  return page
}

test('a snapshot is drawn at the size asked, in a foreignObject', () => {
  const svg = pictureSvg(
    '<style>p { color: red }</style><p>Hello<br>there</p>',
    640,
    480,
    purify,
  )
  const page = parsed(svg)
  expect(page.documentElement.getAttribute('width')).toBe('640')
  expect(page.documentElement.getAttribute('height')).toBe('480')
  const drawn = page.querySelector('foreignObject')
  expect(drawn?.getAttribute('height')).toBe('480')
  expect(drawn?.textContent).toContain('Hello')
  expect(svg).toContain('p { color: red }')
})

test('what an App could run or load is not in its picture', () => {
  const svg = pictureSvg(
    '<p onclick="steal()">Text</p><script>steal()</script><iframe src="https://example.com"></iframe>',
    100,
    100,
    purify,
  )
  parsed(svg)
  expect(svg).not.toContain('steal')
  expect(svg).not.toContain('iframe')
  expect(svg).toContain('Text')
})

test('what an App styles on its root is styled on the element it is drawn in', () => {
  const svg = pictureSvg(
    '<style>:root { --ink: blue } body { color: var(--ink) }</style><p>Ink</p>',
    100,
    100,
    purify,
  )
  expect(svg).toContain('.theorem-pictured-root { --ink: blue }')
  expect(svg).not.toContain(':root')
  expect(parsed(svg).querySelector('html')?.getAttribute('class')).toContain(
    'theorem-pictured-root',
  )
})

test('a root selector joined to another keeps what it is joined to', () => {
  const svg = pictureSvg(
    '<style>.dark:root { --a: 1 } html:root { --b: 2 } :root-ish { --c: 3 }</style><p>x</p>',
    100,
    100,
    purify,
  )
  expect(svg).toContain('.dark.theorem-pictured-root { --a: 1 }')
  expect(svg).toContain('html.theorem-pictured-root { --b: 2 }')
  expect(svg).toContain(':root-ish { --c: 3 }')
})

test('what the App put on its body and root is on the ones it is drawn in', () => {
  const svg = pictureSvg('<p>Night</p>', 100, 100, purify, {
    root: { class: 'dark', 'data-theme': 'night', onload: 'steal()' },
    body: { class: 'bg-slate-900', style: 'background: red; color: white' },
  })
  const page = parsed(svg)
  const root = page.querySelector('html')
  const body = page.querySelector('body')
  expect(root?.getAttribute('class')?.split(' ')).toContain('dark')
  expect(root?.getAttribute('data-theme')).toBe('night')
  expect(body?.getAttribute('class')).toBe('bg-slate-900')
  expect(body?.getAttribute('style')).toContain('background: red')
  expect(svg).not.toContain('steal')
})

describe('what a turn keeps of a picture', () => {
  test('a picture is kept up to the bound and not past it', () => {
    expect(fitsATurn('')).toBe(false)
    expect(fitsATurn('a'.repeat(MAX_PICTURE_BASE64))).toBe(true)
    expect(fitsATurn('a'.repeat(MAX_PICTURE_BASE64 + 1))).toBe(false)
  })
})
