// SOURCING: bun:test over the Markdown handler's panel with live blocks
// registered as the app registers them, rendered with React into happy-dom
// against the live block tests' in-memory workspace and stand-in block routes.
import { afterAll, afterEach, beforeAll, expect, mock, test } from 'bun:test'
import { act } from 'react'
import { registerLiveBlocks } from '@/lib/blocks'
import { BLOCK_SANDBOX } from '@/lib/blocks/executor'
import { registerHandler } from '@/lib/handlers/registry'
import {
  BLOCK_ORIGIN,
  stubLocalServer,
} from '../../../../test/blocks/local-server'
import type { LocalServer } from '../../../../test/blocks/local-server'
import { memoryWorkspace } from '../../../../test/blocks/memory-workspace'
import { cleanup, render, settle, waitFor } from '../../../../test/workspace'

// The icon set imports SVGs through a Vite plugin bun does not run.
void mock.module('@/components/icons', () => ({
  Icon: new Proxy({}, { get: () => () => null }),
}))
const { MarkdownCard, MarkdownPanel } = await import('./markdown-handler')

const CODE = '"Hello from a block"'
const NOTE = `---
title: Today
---
# Today

See [[Other]].

\`\`\`tsx {.live #greeting}
${CODE}
\`\`\`

> [!note] Kept
> A callout beside a block.
`

let server: LocalServer
let undo: Array<() => void> = []
beforeAll(() => {
  server = stubLocalServer()
  undo = [
    registerLiveBlocks(),
    registerHandler({
      id: 'markdown',
      label: 'Markdown',
      priority: 80,
      match: (input) => input.extension === 'md',
      Panel: MarkdownPanel,
      Card: MarkdownCard,
    }),
  ]
})
afterAll(() => {
  for (const fn of undo) fn()
  server.restore()
})
afterEach(cleanup)

async function openNote(path: string) {
  const client = memoryWorkspace({ [path]: NOTE, 'Other.md': '# Other\n' })
  const key = await server.compiled(CODE)
  const entry = { id: 'vf_0', path, kind: 'file' as const, size: 0, mtimeMs: 0 }
  const { container } = await render(
    <MarkdownPanel client={client} path={path} entry={entry} />,
  )
  const block = await waitFor(() =>
    container.querySelector<HTMLElement>('[data-slot="live-block"]'),
  )
  await settle()
  const text = () => new TextDecoder().decode(client.files.get(path))
  return { container, block, key, text }
}

test("a note's live block shows in the Markdown handler beside its links and callouts, and opening it writes nothing", async () => {
  const { container, block, key, text } = await openNote('Shown/Today.md')

  expect(
    block.querySelector<HTMLInputElement>('input[aria-label="Block name"]')
      ?.value,
  ).toBe('greeting')
  const frame = await waitFor(() =>
    block.querySelector<HTMLIFrameElement>('[data-slot="block-frame"] iframe'),
  )
  expect(frame.getAttribute('sandbox')).toBe(BLOCK_SANDBOX)
  expect(frame.src).toBe(`${BLOCK_ORIGIN}/cell/ws_test/${key}`)
  expect(container.querySelector('.theorem-wikilink')).not.toBeNull()
  expect(
    container.querySelector('.theorem-callout')?.getAttribute('data-callout'),
  ).toBe('note')

  await act(() => Bun.sleep(600))
  expect(text()).toBe(NOTE)
})

test('renaming a block saves the note with only its fence changed', async () => {
  const { block, text } = await openNote('Renamed/Today.md')
  const field = block.querySelector<HTMLInputElement>(
    'input[aria-label="Block name"]',
  )!
  await act(async () => {
    field.value = 'hello'
    field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
  await waitFor(() => text().includes('#hello'))
  expect(text()).toBe(NOTE.replace('#greeting', '#hello'))
})
