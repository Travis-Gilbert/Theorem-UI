import { afterEach, expect, mock, test } from 'bun:test'
import { act } from 'react'
import { FieldEditorPopover } from './fields'
import type { FieldSpec } from './contract'
import { cleanup, render, waitFor } from '../../../test/blocks/render'

afterEach(cleanup)

const tags: FieldSpec = {
  key: 'tags',
  label: 'Tags',
  field_type: { kind: 'enum_many', variants: ['red', 'blue'] },
  required: false,
  system: false,
}

async function open(onCommit: (value: unknown) => void) {
  await render(
    <FieldEditorPopover
      anchor={document.body}
      field={tags}
      value={['red']}
      onCommit={onCommit}
      onDiscard={() => {}}
    />,
  )
  const option = await waitFor(() =>
    [...document.querySelectorAll('[role="option"]')].find(
      (item) => item.textContent.trim() === 'blue',
    ),
  )
  await act(async () => (option as HTMLElement).click())
}

test('clicking away saves what a multi-select is holding', async () => {
  const onCommit = mock((_value: unknown) => {})
  await open(onCommit)
  expect(onCommit).not.toHaveBeenCalled()
  await act(async () => {
    const outside = document.documentElement
    outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    outside.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    outside.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await waitFor(() => (onCommit.mock.calls.length ? true : undefined))
  expect(onCommit.mock.calls[0]?.[0]).toEqual(['red', 'blue'])
})

test('Escape saves once, not again through the popover closing', async () => {
  const onCommit = mock((_value: unknown) => {})
  await open(onCommit)
  const input = document.querySelector('input')!
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
  })
  await waitFor(() => (onCommit.mock.calls.length ? true : undefined))
  expect(onCommit.mock.calls).toHaveLength(1)
})
