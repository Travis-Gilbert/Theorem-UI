import { describe, expect, test } from 'bun:test'
import { isFieldSpace } from './life-backdrop'

function page(html: string) {
  document.body.innerHTML = html
  return (selector: string) => document.querySelector(selector) as Element
}

describe('isFieldSpace', () => {
  const at = page(`
    <div id="field"><div id="empty"></div><div data-message-id="m"><p id="said"></p></div><button id="control"></button></div>
    <div role="listbox"><div role="option" id="portaled"></div></div>
  `)

  test('empty space inside the box is the field', () => {
    expect(isFieldSpace(at('#field'), at('#empty'))).toBe(true)
  })

  test('messages and controls belong to the chat', () => {
    expect(isFieldSpace(at('#field'), at('#said'))).toBe(false)
    expect(isFieldSpace(at('#field'), at('#control'))).toBe(false)
  })

  // React bubbles a portaled popup's press through the box. Capturing it would
  // leave the option without its click, as it did the composer's model picker.
  test('a popup rendered outside the box is not the field', () => {
    expect(isFieldSpace(at('#field'), at('#portaled'))).toBe(false)
  })
})
