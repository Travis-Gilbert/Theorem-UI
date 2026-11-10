import { afterEach, expect, test } from 'bun:test'
import { MAX_OUTLINE_LINES, outlineOf } from './outline'

afterEach(() => {
  document.body.innerHTML = ''
})

/** The outline of a page holding `html`. */
function outline(html: string): string {
  document.body.innerHTML = html
  return outlineOf(document.body)
}

test('each thing is a line with its role, its name and its state', () => {
  expect(
    outline(`
      <h1>Shopping list</h1>
      <label for="item">New item</label>
      <input id="item" value="Milk" required />
      <button disabled>Add</button>
      <a href="/all">See all</a>
    `),
  ).toBe(
    [
      '- heading "Shopping list" [level=1]',
      '- text: "New item"',
      '- textbox "New item" [required]: "Milk"',
      '- button "Add" [disabled]',
      '- link "See all"',
    ].join('\n'),
  )
})

test('what holds other things is indented over them, and plain wrappers are not things', () => {
  expect(
    outline(`
      <div><ul>
        <li><span>Milk</span></li>
        <li><label><input type="checkbox" checked /> Eggs</label></li>
      </ul></div>
    `),
  ).toBe(
    [
      '- list',
      '  - listitem: "Milk"',
      '  - listitem',
      '    - checkbox "Eggs" [checked]',
      '    - text: "Eggs"',
    ].join('\n'),
  )
})

test('a field says what it holds now, not what it was written with', () => {
  document.body.innerHTML =
    '<input aria-label="Name" value="before" /><select aria-label="Size"><option>S</option><option>L</option></select>'
  const [name, size] = document.body.children as unknown as [
    HTMLInputElement,
    HTMLSelectElement,
  ]
  name.value = 'after'
  size.selectedIndex = 1
  expect(outlineOf(document.body).split('\n').slice(0, 2)).toEqual([
    '- textbox "Name": "after"',
    '- combobox "Size": "L"',
  ])
})

test('what is hidden is left out, and a role that was given is the role', () => {
  expect(
    outline(`
      <p hidden>gone</p>
      <p aria-hidden="true">gone</p>
      <p style="display: none">gone</p>
      <div role="tab" aria-selected="true">Details</div>
      <div role="switch" aria-checked="true" aria-label="Dark mode"></div>
      <img alt="" src="spacer.png" />
    `),
  ).toBe(
    ['- tab "Details" [selected]', '- switch "Dark mode" [checked]'].join('\n'),
  )
})

test('a thing made by source says where, and a picture is named and not read', () => {
  expect(
    outline(`
      <button data-theorem-source="main.tsx:12:7">Save</button>
      <canvas aria-label="Spending by month"><p>fallback</p></canvas>
      <svg><title>Trend</title><circle r="1" /></svg>
    `),
  ).toBe(
    [
      '- button "Save" [source=main.tsx:12:7]',
      '- canvas "Spending by month"',
      '- img "Trend"',
    ].join('\n'),
  )
})

test('a button that holds a control lists it, and a long page is cut and counted', () => {
  expect(outline('<div role="button">Open <a href="/x">help</a></div>')).toBe(
    ['- button "Open help"', '  - text: "Open"', '  - link "help"'].join('\n'),
  )
  const long = outline('<p>line</p>'.repeat(MAX_OUTLINE_LINES + 3))
  expect(long.split('\n')).toHaveLength(MAX_OUTLINE_LINES + 1)
  expect(long.endsWith('… 3 more')).toBe(true)
})
