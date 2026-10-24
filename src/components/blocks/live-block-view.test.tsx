// SOURCING: bun:test over live blocks in Crepe, set up as the Markdown
// handler sets it up (test/blocks/crepe.tsx) with liveBlocksExtension,
// rendered with React into happy-dom against a stand-in for the local
// server's block routes (test/blocks/local-server.ts).
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test'
import type { Crepe } from '@milkdown/crepe'
import { EditorView } from '@codemirror/view'
import { act } from 'react'
import { BLOCK_SANDBOX } from '@/lib/blocks/executor'
import { liveBlocksExtension } from '@/lib/blocks'
import type { FileViewProps } from '@/lib/handlers/types'
import { MarkdownEditor } from '../../../test/blocks/crepe'
import {
  BLOCK_ORIGIN,
  stubLocalServer,
} from '../../../test/blocks/local-server'
import type { LocalServer } from '../../../test/blocks/local-server'
import { memoryWorkspace } from '../../../test/blocks/memory-workspace'
import {
  buttonNamed,
  cleanup,
  click,
  render,
  waitFor,
} from '../../../test/blocks/render'

let server: LocalServer
beforeAll(() => {
  server = stubLocalServer()
})
afterAll(() => server.restore())
afterEach(cleanup)

const CSV = 'date,habit,done\n2026-10-20,run,1\n2026-10-21,read,0\n'
const CODE = '"Hello from a block"'
const NOTE = `# Today

\`\`\`tsx {.live #greeting}
${CODE}
\`\`\`

The log:

\`\`\`query {.live #log}
from: Data/habits.csv
\`\`\`

\`\`\`python {.live}
print("no runtime")
\`\`\`
`

/**
 * A note in a folder of its own: sessions are shared by folder and path, so
 * each test opens a path no other test opened.
 */
async function openNote(
  path: string,
  { trusted = true, note = NOTE }: { trusted?: boolean; note?: string } = {},
) {
  const client = memoryWorkspace(
    { [path]: note, 'Data/habits.csv': CSV },
    { trusted },
  )
  const key = await server.compiled(CODE)
  const entry = { id: 'vf_0', path, kind: 'file' as const, size: 0, mtimeMs: 0 }
  const file: FileViewProps = { client, path, entry }
  let crepe: Crepe | undefined
  const { container } = await render(
    <MarkdownEditor
      file={file}
      markdown={note}
      extensions={[liveBlocksExtension]}
      onCrepe={(created) => (crepe = created)}
    />,
  )
  const blocks = () => [
    ...container.querySelectorAll<HTMLElement>('[data-slot="live-block"]'),
  ]
  await waitFor(() => blocks().length === 3)
  return {
    client,
    container,
    key,
    blocks,
    markdown: () => crepe!.getMarkdown(),
  }
}

const nameField = (block: Element) =>
  block.querySelector<HTMLInputElement>('input[aria-label="Block name"]')!

test('a note shows each block with its source and result, and nothing runs an unknown language', async () => {
  const { blocks, key } = await openNote('Shown/Today.md')
  const [code, query, python] = blocks()

  expect(nameField(code!).value).toBe('greeting')
  expect(code!.querySelector('.cm-content')?.textContent).toBe(CODE)
  const frame = await waitFor(() =>
    code!.querySelector<HTMLIFrameElement>('[data-slot="block-frame"] iframe'),
  )
  expect(frame.getAttribute('sandbox')).toBe(BLOCK_SANDBOX)
  expect(frame.src).toBe(`${BLOCK_ORIGIN}/cell/ws_test/${key}`)

  const cells = await waitFor(() => {
    const found = [...query!.querySelectorAll('tbody td')]
    return found.length > 0 && found.map((td) => td.textContent)
  })
  expect(cells).toContain('run')
  expect(cells).toContain('read')

  expect(python!.textContent).toContain('Nothing runs python')
  expect(python!.querySelector('iframe')).toBeNull()
})

test("an untrusted folder's blocks show their source and the way to trust it", async () => {
  const { blocks } = await openNote('Untrusted/Today.md', { trusted: false })
  const [code, query] = blocks()

  expect(code!.querySelector('.cm-content')?.textContent).toBe(CODE)
  expect(code!.querySelector('[data-slot="trust-gate"]')).not.toBeNull()
  expect(code!.querySelector('iframe')).toBeNull()
  expect(query!.querySelector('table')).toBeNull()
  expect(buttonNamed(code!, 'Run')).toBeUndefined()
})

test('editing, renaming, pinning and unpinning a block change its Markdown and nothing else', async () => {
  const { blocks, markdown, client } = await openNote('Edited/Today.md')
  const untouched = markdown()
  expect(untouched).toBe(NOTE)

  // The source, edited in its CodeMirror view.
  const [code] = blocks()
  const editor = EditorView.findFromDOM(
    code!.querySelector<HTMLElement>('.cm-editor')!,
  )!
  await act(async () =>
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: '1 + 1' },
    }),
  )
  expect(markdown()).toBe(NOTE.replace(CODE, '1 + 1'))

  // Renamed: the fence's #id, and nothing else.
  const field = nameField(blocks()[1]!)
  await act(async () => {
    field.value = 'habits'
    field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
  const renamed = NOTE.replace(CODE, '1 + 1').replace('#log', '#habits')
  expect(markdown()).toBe(renamed)
  // An invalid name is refused.
  await act(async () => {
    nameField(blocks()[1]!).value = '1st'
    nameField(blocks()[1]!).dispatchEvent(
      new FocusEvent('focusout', { bubbles: true }),
    )
  })
  expect(nameField(blocks()[1]!).getAttribute('aria-invalid')).toBe('true')
  expect(markdown()).toBe(renamed)

  // The editor saves; the session reads the new names from the file.
  await act(async () => {
    await client.write('Edited/Today.md', markdown())
  })
  const pin = await waitFor(() => buttonNamed(blocks()[1]!, 'Pin output'))
  await click(pin)
  const pinned = markdown()
  expect(pinned).toContain(
    '```query {.live #habits}\nfrom: Data/habits.csv\n```\n\n<!-- theorem:output #habits -->\n\n|',
  )
  expect(pinned).toContain('| run ')
  expect(
    pinned.replace(/\n\n<!-- theorem:output[\s\S]*?\/theorem:output -->/, ''),
  ).toBe(renamed)

  await click(await waitFor(() => buttonNamed(blocks()[1]!, 'Unpin')))
  expect(markdown()).toBe(renamed)
})

test("hiding a block's code keeps it in the note", async () => {
  const { blocks, markdown } = await openNote('Hidden/Today.md')
  const [code] = blocks()
  await click(buttonNamed(code!, 'Hide code')!)
  expect(code!.querySelector('.cm-editor')).toBeNull()
  expect(buttonNamed(code!, 'Show code')).toBeDefined()
  expect(markdown()).toBe(NOTE)
})
