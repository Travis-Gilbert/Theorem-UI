// SOURCING: bun:test over a frame's snapshot (display.ts, in happy-dom's
// document) and the page's sanitized copy of it (snapshots.ts). DOMPurify
// runs over jsdom's window here, as its own test suite does: happy-dom's
// parser lets attributes through that browsers' parsers hand DOMPurify apart.
import { afterEach, expect, test } from 'bun:test'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { snapshotHtml } from './sandbox/display'
import { snapshotDocument } from './snapshots'

const jsdom = new JSDOM('')
const purify = createDOMPurify(jsdom.window)

const style = document.createElement('style')
style.textContent = '.done { color: green }'

afterEach(() => {
  document.body.replaceChildren()
  style.remove()
})

test('a snapshot keeps what the frame shows, form state included, and drops scripts', () => {
  document.head.append(style)
  document.body.innerHTML = [
    '<div id="root"><label class="done"><input type="checkbox"> run</label>',
    '<label><input type="checkbox" checked> read</label>',
    '<input type="text" value="">',
    '<select><option>a</option><option>b</option></select>',
    '<script>parent.postMessage("hi", "*")</script></div>',
  ].join('')
  const [run, read] = document.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  )
  run!.checked = true
  read!.checked = false
  document.querySelector<HTMLInputElement>('input[type="text"]')!.value = 'note'
  document.querySelector('select')!.selectedIndex = 1

  const html = snapshotHtml()
  const styleAt = html.indexOf('<style>.done { color: green }</style>')
  expect(styleAt).toBeGreaterThanOrEqual(0)
  expect(styleAt).toBeLessThan(html.indexOf('<div id="root">'))
  const copy = new DOMParser().parseFromString(html, 'text/html')
  const boxes = [...copy.querySelectorAll('input[type="checkbox"]')]
  expect(boxes.map((box) => box.hasAttribute('checked'))).toEqual([true, false])
  expect(copy.querySelector('input[type="text"]')?.getAttribute('value')).toBe(
    'note',
  )
  expect(
    [...copy.querySelectorAll('option')].map((o) => o.hasAttribute('selected')),
  ).toEqual([false, true])
  expect(copy.querySelector('script')).toBeNull()
})

test('the page shows a snapshot sanitized, under a policy that loads nothing', () => {
  const doc = snapshotDocument(
    [
      '<style>.x { color: red }</style>',
      '<img src="x" onerror="alert(1)">',
      '<meta http-equiv="refresh" content="0;url=https://example.com/?leak">',
      '<iframe src="https://example.com"></iframe>',
      '<a href="javascript:alert(1)">link</a>',
      '<p class="x">kept</p>',
    ].join(''),
    purify,
  )
  const parsed = new jsdom.window.DOMParser().parseFromString(doc, 'text/html')
  expect(
    parsed
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content'),
  ).toBe(
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:",
  )
  expect(parsed.body.querySelector('style')?.textContent).toBe(
    '.x { color: red }',
  )
  expect(parsed.querySelector('p.x')?.textContent).toBe('kept')
  expect(parsed.querySelector('img')?.hasAttribute('onerror')).toBe(false)
  expect(parsed.body.querySelector('meta')).toBeNull()
  expect(parsed.querySelector('iframe')).toBeNull()
  expect(parsed.querySelector('a')?.hasAttribute('href')).toBe(false)
})
