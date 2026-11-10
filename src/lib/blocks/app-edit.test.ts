// SOURCING: bun:test over the element reader and source edits (app-edit.ts).
import { describe, expect, test } from 'bun:test'
import { typescriptApp } from '../../../test/blocks/typescript-app'
import {
  editElement,
  parsePlace,
  readElement,
  writeAppSource,
} from './app-edit'
import { appSourcesOf } from './app-source'

const FILE = `import { useState } from 'react'

export function Header({ count }: { count: number }) {
  const [open, setOpen] = useState(false)
  return (
    <header className="bar" title="All organizations" onClick={() => setOpen(!open)}>
      <h2 className="title">Organizations</h2>
      <span data-count={count}>{count} in all</span>
      <input placeholder='Find "one"' disabled />
      <p>
        Funding by <b>area</b>
      </p>
      <button {...{ type: 'button' }} aria-label={open ? 'Close' : 'Open'}>Menu</button>
    </header>
  )
}`

const at = (line: number, column: number) => ({ line, column })

describe('reading the element at a place', () => {
  test('a stamp is a file, a line and a column', () => {
    expect(parsePlace('parts/Table.tsx:26:13')).toEqual({
      file: 'parts/Table.tsx',
      line: 26,
      column: 13,
    })
    expect(parsePlace('Table.tsx')).toBeNull()
  })

  test('its tag, its attributes written as strings, and its text', () => {
    const heading = readElement(FILE, at(7, 7))!
    expect(heading.tag).toBe('h2')
    expect(heading.attributes.map(({ name, value }) => [name, value])).toEqual([
      ['className', 'title'],
    ])
    expect(heading.text?.value).toBe('Organizations')
  })

  test('an attribute written as code is not one it offers to change', () => {
    const header = readElement(FILE, at(6, 5))!
    expect(header.tag).toBe('header')
    expect(header.attributes.map((attribute) => attribute.name)).toEqual([
      'className',
      'title',
    ])
    // Its children are elements, not text.
    expect(header.text).toBeUndefined()
  })

  test('children with code or elements in them are not plain text', () => {
    expect(readElement(FILE, at(8, 7))!.text).toBeUndefined()
    expect(readElement(FILE, at(10, 7))!.text).toBeUndefined()
  })

  test('a self-closing tag, single quotes, a bare attribute and a spread', () => {
    const input = readElement(FILE, at(9, 7))!
    expect(input.tag).toBe('input')
    expect(input.attributes).toMatchObject([
      { name: 'placeholder', value: 'Find "one"' },
    ])
    const button = readElement(FILE, at(13, 7))!
    expect(button.attributes).toEqual([])
    expect(button.text?.value).toBe('Menu')
  })

  test('a place that is not an element is nothing', () => {
    expect(readElement(FILE, at(4, 3))).toBeNull()
    expect(readElement(FILE, at(400, 1))).toBeNull()
  })
})

describe('editing the element at a place', () => {
  test('its text changes and the lines around it do not', () => {
    const edited = editElement(FILE, at(7, 7), [
      { kind: 'text', value: 'Funders' },
    ])
    expect(edited).toBe(FILE.replace('>Organizations<', '>Funders<'))
  })

  test('text that would read as code is written as a string', () => {
    const edited = editElement(FILE, at(7, 7), [
      { kind: 'text', value: 'A {b} <c>' },
    ])
    expect(edited).toContain('<h2 className="title">{"A {b} <c>"}</h2>')
    expect(readElement(edited, at(7, 7))!.tag).toBe('h2')
  })

  test('an attribute changes, is added and is taken away, in one edit', () => {
    const edited = editElement(FILE, at(6, 5), [
      { kind: 'attribute', name: 'className', value: 'bar wide' },
      { kind: 'attribute', name: 'title', value: null },
      { kind: 'attribute', name: 'id', value: 'top "bar"' },
    ])
    expect(edited.split('\n')[5]).toBe(
      `    <header id="top &quot;bar&quot;" className="bar wide" onClick={() => setOpen(!open)}>`,
    )
    // What was written reads back as what was meant.
    expect(
      readElement(edited, at(6, 5))!.attributes.map(({ name, value }) => [
        name,
        value,
      ]),
    ).toEqual([
      ['id', 'top "bar"'],
      ['className', 'bar wide'],
    ])
  })

  test('an edit that does not apply is refused, and nothing is guessed', () => {
    expect(() =>
      editElement(FILE, at(8, 7), [{ kind: 'text', value: 'x' }]),
    ).toThrow('does not hold plain text')
    expect(() =>
      editElement(FILE, at(4, 3), [{ kind: 'text', value: 'x' }]),
    ).toThrow('no longer at this place')
    expect(() =>
      editElement(FILE, at(7, 7), [
        { kind: 'attribute', name: 'on click', value: 'x' },
      ]),
    ).toThrow('not an attribute name')
  })
})

describe("writing a file back into an App's page", () => {
  const html = typescriptApp(
    { 'main.tsx': 'first()', 'Header.tsx': FILE },
    {
      uses: 'db("records")',
      body: '<div id="root"></div><p>Kept as written</p>',
    },
  )

  test('that file changes and the rest of the page is untouched', () => {
    const edited = writeAppSource(html, 'Header.tsx', 'second()')
    expect(appSourcesOf(edited)!.files).toEqual({
      'main.tsx': 'first()',
      'Header.tsx': 'second()',
    })
    expect(edited.replace('second()', FILE)).toBe(html)
  })

  test('a file the App lacks, or text that would end its script, is refused', () => {
    expect(() => writeAppSource(html, 'Other.tsx', '')).toThrow('no file')
    expect(() =>
      writeAppSource(html, 'main.tsx', 'const s = "</script>"'),
    ).toThrow('cannot contain')
  })
})
