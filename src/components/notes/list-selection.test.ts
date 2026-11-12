// The pinned Milkdown list view restores its DOM selection on the next frame.
// Exercise real ProseMirror transactions around that frame: a later keystroke
// or selection must take precedence over the list item's mount-time capture.
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  rootCtx,
} from '@milkdown/kit/core'
import { listItemBlockComponent } from '@milkdown/kit/component/list-item-block'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { splitListItem } from '@milkdown/kit/prose/schema-list'
import { Selection, TextSelection } from '@milkdown/kit/prose/state'
import { getMarkdown } from '@milkdown/kit/utils'

const frames = new Map<number, FrameRequestCallback>()
const mounted: Array<{ editor: Editor; root: HTMLElement }> = []
let nextFrame = 0
let requestFrame: ReturnType<
  typeof spyOn<typeof globalThis, 'requestAnimationFrame'>
>
let cancelFrame: ReturnType<
  typeof spyOn<typeof globalThis, 'cancelAnimationFrame'>
>

beforeEach(() => {
  requestFrame = spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
    (callback) => {
      const id = ++nextFrame
      frames.set(id, callback)
      return id
    },
  )
  cancelFrame = spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(
    (id) => {
      frames.delete(id)
    },
  )
})

afterEach(async () => {
  for (const { editor, root } of mounted.splice(0)) {
    await editor.destroy()
    root.remove()
  }
  frames.clear()
  requestFrame.mockRestore()
  cancelFrame.mockRestore()
})

function runFrame() {
  for (const [id, callback] of [...frames]) {
    frames.delete(id)
    callback(performance.now())
  }
}

async function createList() {
  const root = document.createElement('div')
  document.body.append(root)
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, '* First item')
    })
    .use(commonmark)
    .use(listItemBlockComponent)
    .create()
  mounted.push({ editor, root })
  const view = editor.ctx.get(editorViewCtx)
  return { editor, view }
}

test('typing before the list mount frame preserves exact character order', async () => {
  const { editor, view } = await createList()
  runFrame()
  view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)))
  expect(
    splitListItem(view.state.schema.nodes.list_item!)(
      view.state,
      view.dispatch,
    ),
  ).toBe(true)
  view.dispatch(view.state.tr.insertText('Se'))
  runFrame()
  view.dispatch(view.state.tr.insertText('cond item'))
  expect(editor.action(getMarkdown())).toBe('* First item\n* Second item\n')
})

test('a later selection takes precedence over the mounted list item', async () => {
  const { view } = await createList()
  runFrame()
  view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)))
  splitListItem(view.state.schema.nodes.list_item!)(view.state, view.dispatch)
  const selected = TextSelection.create(view.state.doc, 3, 8)
  view.dispatch(view.state.tr.setSelection(selected))
  runFrame()
  expect(view.state.selection.eq(selected)).toBe(true)
})

test('formatting enabled before the list mount frame stays active for typing', async () => {
  const { editor, view } = await createList()
  runFrame()
  view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)))
  splitListItem(view.state.schema.nodes.list_item!)(view.state, view.dispatch)
  view.dispatch(
    view.state.tr.addStoredMark(view.state.schema.marks.strong!.create()),
  )
  runFrame()
  view.dispatch(view.state.tr.insertText('Second item'))
  expect(editor.action(getMarkdown())).toBe('* First item\n* **Second item**\n')
})

test('the newest unchanged capture in a frame still restores once', async () => {
  const { view } = await createList()
  runFrame()
  const end = Selection.atEnd(view.state.doc).from
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, end)),
  )
  splitListItem(view.state.schema.nodes.list_item!)(view.state, view.dispatch)
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, end)),
  )
  splitListItem(view.state.schema.nodes.list_item!)(view.state, view.dispatch)
  const selected = view.state.selection
  const dispatch = spyOn(view, 'dispatch')
  runFrame()
  expect(dispatch).toHaveBeenCalledTimes(1)
  expect(view.state.selection.eq(selected)).toBe(true)
  dispatch.mockRestore()
})

test('an unchanged list still restores once and a destroyed view is not restored', async () => {
  const { editor, view } = await createList()
  const dispatch = spyOn(view, 'dispatch')
  const selected = view.state.selection
  runFrame()
  expect(dispatch).toHaveBeenCalledTimes(1)
  expect(view.state.selection.eq(selected)).toBe(true)

  view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)))
  splitListItem(view.state.schema.nodes.list_item!)(view.state, view.dispatch)
  await editor.destroy()
  dispatch.mockClear()
  runFrame()
  expect(dispatch).not.toHaveBeenCalled()
  dispatch.mockRestore()
})
