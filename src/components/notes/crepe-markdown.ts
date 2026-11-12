// SOURCING: @milkdown/crepe mounted through @milkdown/react's useEditor, its listener plugin (mounted, markdownUpdated, destroy) and @milkdown/kit/utils (getMarkdown, replaceAll)
//
// One Markdown string in and out of a Crepe editor, for the note editor and the
// chat composer. The editor's own edits go out through onChange; a change that
// arrives from elsewhere replaces the document. Two strings tell the two apart,
// since Milkdown's markdownUpdated listener is debounced: what the owner holds,
// and the editor's own writing of its document, which can differ from text it
// was handed (a list marker, a trailing line) without that being an edit.
import type { Crepe } from '@milkdown/crepe'
import { editorViewCtx, serializerCtx } from '@milkdown/kit/core'
import type { Editor } from '@milkdown/kit/core'
import type { Serializer } from '@milkdown/kit/transformer'
import { getMarkdown, replaceAll } from '@milkdown/kit/utils'
import { useEditor } from '@milkdown/react'
import { useEffect, useLayoutEffect, useRef } from 'react'

export type CrepeMarkdown = {
  /** The Markdown the editor opens with. */
  markdown: string
  /** Hands the editor's text on when it is a new edit. */
  report: (markdown: string) => void
  /** Reports the editor's text now, ahead of the debounced listener. */
  flush: () => void
}

const asWritten = (markdown: string) => markdown

/**
 * Mounts the Crepe `build` makes (inside a MilkdownProvider, rendered by
 * `<Milkdown />`) and keeps it and `markdown` the same text. `read` is applied
 * to everything the editor serializes before it is compared or handed on.
 */
export function useCrepeMarkdown({
  markdown,
  onChange,
  build,
  read = asWritten,
}: {
  markdown: string
  onChange: (markdown: string) => void
  build: (root: HTMLElement, editor: CrepeMarkdown) => Crepe
  read?: (markdown: string) => string
}) {
  /** The Markdown the owner holds: what it last passed in or was handed. */
  const shown = useRef(markdown)
  /** The editor's own writing of the document it shows. */
  const own = useRef(read(markdown))
  /** An outside change is being put in the editor, which is not an edit. */
  const replacing = useRef(false)
  const latest = useRef(onChange)
  useLayoutEffect(() => {
    latest.current = onChange
  })

  const report = (next: string) => {
    if (replacing.current || next === own.current) return
    own.current = next
    shown.current = next
    latest.current(next)
  }
  const running = useRef<() => Editor | undefined>(() => undefined)
  const flush = () => {
    const editor = running.current()
    if (editor) report(read(editor.action(getMarkdown())))
  }

  const { get } = useEditor((root) => {
    const crepe = build(root, { markdown, report, flush })
    crepe.on((listener) => {
      // Milkdown removes the serializer before it closes the view, so the
      // destroy handler below keeps its own.
      let serialize: Serializer | undefined
      // Normalization on load is not an edit; remember the editor's own form.
      listener.mounted((ctx) => {
        serialize = ctx.get(serializerCtx)
        own.current = read(crepe.getMarkdown())
      })
      listener.markdownUpdated((_ctx, next) => report(read(next)))
      // markdownUpdated waits 200ms and is dropped when the editor closes, so
      // a closing editor hands over its last text itself.
      listener.destroy((ctx) => {
        if (serialize) report(read(serialize(ctx.get(editorViewCtx).state.doc)))
      })
    })
    return crepe
  }, [])
  useLayoutEffect(() => {
    running.current = get
  })

  // A change from elsewhere replaces the document.
  useEffect(() => {
    if (markdown === shown.current) return
    const editor = get()
    if (!editor) return
    replacing.current = true
    try {
      editor.action(replaceAll(markdown))
    } finally {
      replacing.current = false
    }
    shown.current = markdown
    own.current = read(editor.action(getMarkdown()))
  }, [get, markdown, read])

  return { get, flush }
}
