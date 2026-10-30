// SOURCING: bun:test over the `[[` suggestions of the Markdown handler's
// editor, typed through ProseMirror's handleTextInput and keydown as a browser
// sends them, rendered into happy-dom against the in-memory workspace.
import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { Crepe } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { act } from 'react'
import { registerMarkdownExtension } from '@/lib/handlers/registry'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import {
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
const { parseQuery } = await import('./wiki-suggest')

const OTHER = '# Other\n\nOther body text.\n\n## Details\n\nDeep. ^deep\n'

const FILES = {
  'Note.md': '# Note\n\nStart.\n',
  'Other.md': OTHER,
  'Projects/Overview.md': '# Overview\n',
  'img/photo.png': new Uint8Array([1]),
}

const entry = (path: string): WorkspaceEntry => ({
  id: `vf_${path}`,
  path,
  kind: 'file',
  size: 1,
  mtimeMs: 1,
})

afterEach(cleanup)

/** Opens `Note.md` with the caret at its end; the editor's view. */
async function openNote(files: Record<string, string | Uint8Array> = FILES) {
  const ws = fakeWorkspace(files)
  let crepe: Crepe | undefined
  const off = registerMarkdownExtension({
    id: 'wiki-suggest-test',
    extend: (editor) => void (crepe = editor),
  })
  const { container } = await render(
    <MarkdownPanel
      client={ws.client}
      path="Note.md"
      entry={entry('Note.md')}
    />,
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
  return { ws, view }
}

/** Types `text` a key at a time, as the browser hands it to the editor. */
async function type(view: EditorView, text: string) {
  await act(async () => {
    for (const char of text) {
      const { from, to } = view.state.selection
      const insert = () => view.state.tr.insertText(char, from, to)
      if (
        !view.someProp('handleTextInput', (f) =>
          f(view, from, to, char, insert),
        )
      )
        view.dispatch(insert())
    }
  })
}

async function press(view: EditorView, key: string) {
  await act(async () => {
    view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    )
  })
}

const list = () => document.querySelector('[data-slot="wiki-suggest"]')

/** The listed entries' labels, once the list shows `count` of them. */
async function options(count: number) {
  await waitFor(
    () => list()?.querySelectorAll('[role="option"]').length === count,
  )
  return [...list()!.querySelectorAll('[role="option"]')].map(
    (option) => option.querySelector('span')?.textContent,
  )
}

const highlighted = () =>
  list()?.querySelector('[aria-selected="true"] span')?.textContent

/** The wikilinks and embeds in the document. */
function wikiNodes(view: EditorView) {
  const found: Array<{ type: string; value: string; alias: string | null }> = []
  view.state.doc.descendants((node) => {
    if (node.type.name === 'wikiLink' || node.type.name === 'wikiEmbed')
      found.push({
        type: node.type.name,
        value: node.attrs.value as string,
        alias: node.attrs.alias as string | null,
      })
  })
  return found
}

describe('parseQuery', () => {
  test('reads the target, its heading or block, and the alias', () => {
    expect(parseQuery('Pla')).toMatchObject({ mode: 'file', search: 'Pla' })
    expect(parseQuery('Plan#Go')).toMatchObject({
      mode: 'heading',
      note: 'Plan',
      search: 'Go',
    })
    expect(parseQuery('Plan#^ke')).toMatchObject({
      mode: 'block',
      note: 'Plan',
      search: 'ke',
    })
    expect(parseQuery('Plan|the plan')).toMatchObject({
      target: 'Plan',
      alias: 'the plan',
    })
    expect(parseQuery('Plan|')).toMatchObject({ alias: null })
  })
})

describe('[[ suggestions', () => {
  test("list the folder's files as typed, and Enter links the highlighted one", async () => {
    const { view } = await openNote()
    await type(view, '[[')
    expect(await options(4)).toEqual(['Note', 'Other', 'photo.png', 'Overview'])

    // Matched fuzzily: Overview by its folder, Projects.
    await type(view, 'ot')
    expect(await options(4)).toEqual(['Other', 'Note', 'photo.png', 'Overview'])
    expect(highlighted()).toBe('Other')

    await press(view, 'Enter')
    expect(wikiNodes(view)).toEqual([
      { type: 'wikiLink', value: 'Other', alias: null },
    ])
    expect(view.state.doc.textContent).not.toContain('[[')
    await waitFor(() => list() === null)
  })

  test('arrows move the highlight, Tab inserts it, a click inserts one', async () => {
    const { view } = await openNote()
    await type(view, '[[o')
    expect(await options(4)).toEqual(['Other', 'Overview', 'Note', 'photo.png'])
    await press(view, 'ArrowDown')
    expect(highlighted()).toBe('Overview')
    await press(view, 'ArrowUp')
    await press(view, 'ArrowUp')
    expect(highlighted()).toBe('photo.png')
    await press(view, 'Tab')
    expect(wikiNodes(view)).toEqual([
      { type: 'wikiLink', value: 'photo.png', alias: null },
    ])

    await type(view, ' [[Ov')
    await options(1)
    act(() => list()!.querySelector<HTMLElement>('[role="option"]')!.click())
    expect(wikiNodes(view).at(-1)?.value).toBe('Overview')
  })

  test('Escape closes the list and keeps what was typed', async () => {
    const { view } = await openNote()
    await type(view, '[[Oth')
    await options(1)
    await press(view, 'Escape')
    await waitFor(() => list() === null)
    expect(view.state.doc.textContent).toContain('[[Oth')
    expect(wikiNodes(view)).toEqual([])
  })

  test('a name two files share links by its path', async () => {
    const { view } = await openNote({
      ...FILES,
      'Plan.md': '',
      'Notes/Plan.md': '',
    })
    await type(view, '[[Plan')
    expect(await options(2)).toEqual(['Plan', 'Plan'])
    await press(view, 'ArrowDown')
    await press(view, 'Enter')
    expect(wikiNodes(view)).toEqual([
      { type: 'wikiLink', value: 'Notes/Plan', alias: null },
    ])
  })

  test("`#` lists a note's headings and `#^` its blocks", async () => {
    const { view } = await openNote()
    await type(view, '[[Other#')
    expect(await options(2)).toEqual(['Other', 'Details'])
    await type(view, 'det')
    await options(1)
    await press(view, 'Enter')

    await type(view, ' [[Other#^')
    expect(await options(1)).toEqual(['^deep'])
    await press(view, 'Enter')

    // Without a note, the headings are this note's own.
    await type(view, ' [[#')
    expect(await options(1)).toEqual(['Note'])
    await press(view, 'Enter')

    expect(wikiNodes(view).map((n) => n.value)).toEqual([
      'Other#Details',
      'Other#^deep',
      '#Note',
    ])
  })

  test('text after `|` becomes the alias', async () => {
    const { view } = await openNote()
    await type(view, '[[Oth|the other one')
    await options(1)
    await press(view, 'Enter')
    expect(wikiNodes(view)).toEqual([
      { type: 'wikiLink', value: 'Other', alias: 'the other one' },
    ])
  })

  test('with nothing listed, Enter links what was typed', async () => {
    const { view } = await openNote()
    await type(view, '[[Nowhere')
    await waitFor(() => list()?.textContent.includes('No file matches'))
    await press(view, 'Enter')
    expect(wikiNodes(view)).toEqual([
      { type: 'wikiLink', value: 'Nowhere', alias: null },
    ])
  })

  test('`![[` inserts an embed', async () => {
    const { view } = await openNote()
    await type(view, '![[Oth')
    await options(1)
    expect(list()?.getAttribute('aria-label')).toBe('Embed a file')
    await press(view, 'Enter')
    expect(wikiNodes(view)).toEqual([
      { type: 'wikiEmbed', value: 'Other', alias: null },
    ])
  })
})
