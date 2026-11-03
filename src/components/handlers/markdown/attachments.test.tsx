// SOURCING: bun:test over a note's attachments: their names, the folder the
// setting puts them in, and the embed or URL the editor gets back, pasted
// through ProseMirror's paste handler and rendered into happy-dom against the
// in-memory workspace.
import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { Crepe } from '@milkdown/crepe'
import { imageBlockConfig } from '@milkdown/kit/component/image-block'
import { editorViewCtx } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { act } from 'react'
import { registerMarkdownExtension } from '@/lib/handlers/registry'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import {
  DEFAULT_FOLDER_SETTINGS,
  cleanup,
  fakeWorkspace,
  render,
  settle,
  waitFor,
} from '../../../../test/workspace'

// The icon set imports SVGs through a Vite plugin bun does not run.
void mock.module('@/components/icons', () => ({
  Icon: new Proxy({}, { get: () => () => null }),
}))
const { MarkdownPanel } = await import('./markdown-handler')
const { attachmentName, relativeUrl } = await import('./attachments')

const NOTE = 'notes/Note.md'
const NOW = new Date(2026, 9, 23, 9, 5, 7)

const entry = (path: string): WorkspaceEntry => ({
  id: `vf_${path}`,
  path,
  kind: 'file',
  size: 1,
  mtimeMs: 1,
})

const image = (name: string, type = 'image/png') =>
  new File([new Uint8Array([137, 80, 78, 71])], name, { type })

afterEach(cleanup)

describe('attachmentName', () => {
  test('names an image pasted without a name as Obsidian does', () => {
    expect(attachmentName(image('image.png'), NOW)).toBe(
      'Pasted image 20261023090507.png',
    )
    expect(attachmentName(image('', 'image/gif'), NOW)).toBe(
      'Pasted image 20261023090507.gif',
    )
  })

  test("keeps a file's own name", () => {
    expect(attachmentName(image('diagram.png'), NOW)).toBe('diagram.png')
    expect(
      attachmentName(new File([''], 'report.pdf', { type: 'application/pdf' })),
    ).toBe('report.pdf')
    expect(
      attachmentName(new File([''], '', { type: 'application/pdf' }), NOW),
    ).toBe('Pasted file 20261023090507.pdf')
  })
})

test('relativeUrl links a file from the note, encoded for Markdown', () => {
  expect(relativeUrl('notes/a.md', 'Attachments/Pasted image 1.png')).toBe(
    '../Attachments/Pasted%20image%201.png',
  )
  expect(relativeUrl('notes/a.md', 'notes/x.png')).toBe('x.png')
  expect(relativeUrl('a.md', 'b c.png')).toBe('b%20c.png')
})

/** Opens the note with the folder's `attachments` setting; its editor. */
async function openNote(
  attachments: string,
  files: Record<string, string | Uint8Array> = {},
) {
  const ws = fakeWorkspace({ [NOTE]: 'Start.\n', ...files })
  await ws.client.setSettings({ ...DEFAULT_FOLDER_SETTINGS, attachments })
  let crepe: Crepe | undefined
  const off = registerMarkdownExtension({
    id: 'attachments-test',
    extend: (editor) => void (crepe = editor),
  })
  const { container } = await render(
    <MarkdownPanel client={ws.client} path={NOTE} entry={entry(NOTE)} />,
  )
  off()
  await waitFor(() => container.querySelector('.ProseMirror'))
  await settle()
  const view = crepe!.editor.ctx.get(editorViewCtx)
  act(() =>
    view.dispatch(
      view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)),
    ),
  )
  return { ws, view, crepe: crepe! }
}

/** Pastes `file` as a browser does a copied file or screenshot. */
async function paste(view: EditorView, file: File) {
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
  // happy-dom's DataTransfer takes only its own File; the editor reads these.
  Object.defineProperty(event, 'clipboardData', {
    value: { files: [file], types: ['Files'], getData: () => '' },
  })
  await act(async () => {
    view.dom.dispatchEvent(event)
  })
}

const embeds = (view: EditorView) => {
  const values: Array<string> = []
  view.state.doc.descendants((node) => {
    if (node.type.name === 'wikiEmbed') values.push(node.attrs.value as string)
  })
  return values
}

const written = (ws: ReturnType<typeof fakeWorkspace>) =>
  ws.writes.map((w) => w.path).filter((path) => path !== NOTE)

describe('pasted files', () => {
  test('go where the setting says and are embedded by name', async () => {
    const { ws, view } = await openNote('Attachments')
    await paste(view, image('image.png'))
    const path = await waitFor(() => written(ws)[0])
    expect(path).toMatch(/^Attachments\/Pasted image \d{14}\.png$/)
    await waitFor(() => embeds(view).length)
    expect(embeds(view)).toEqual([path.slice('Attachments/'.length)])
  })

  test('go beside the note by default, and link by path when a name is taken', async () => {
    const { ws, view } = await openNote('./', {
      'img/diagram.png': new Uint8Array([1]),
    })
    await paste(view, image('diagram.png'))
    await waitFor(() => embeds(view).length)
    expect(written(ws)).toEqual(['notes/diagram.png'])
    expect(embeds(view)).toEqual(['notes/diagram.png'])
  })

  test('take a free name beside one already there', async () => {
    const { ws, view } = await openNote('Attachments', {
      'Attachments/diagram.png': new Uint8Array([1]),
    })
    await paste(view, image('diagram.png'))
    await waitFor(() => embeds(view).length)
    expect(written(ws)).toEqual([
      'Attachments/diagram.png',
      'Attachments/diagram 1.png',
    ])
    expect(embeds(view)).toEqual(['diagram 1.png'])
  })
})

test("an image block's upload follows the setting and links from the note", async () => {
  const { ws, crepe } = await openNote('Attachments')
  const { onUpload } = crepe.editor.ctx.get(imageBlockConfig.key)
  let url = ''
  await act(async () => {
    url = await onUpload(image('photo one.png'))
  })
  expect(url).toBe('../Attachments/photo%20one.png')
  expect(ws.text('Attachments/photo one.png')).toBeDefined()
})
