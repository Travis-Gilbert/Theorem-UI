// SOURCING: @milkdown/crepe (Markdown that formats as it is typed: marks, headings, lists, quotes, links and their tooltip, CodeMirror code blocks, the selection toolbar, the placeholder) over the note editor's Markdown round trip in notes/crepe-markdown; assistant-ui's headless composer seams (unstable_useComposerInput for the text and its disabled state, unstable_useTriggerPopoverRootContextOptional and unstable_useTriggerPopoverAriaProps for the / menu, useThreadViewportStore for the jump to the latest message); mdast-util-to-markdown's own link handler
//
// The composer's input as a Crepe editor. assistant-ui's ComposerPrimitive.Input
// is a text area with no seam for another editor, and nothing upstream joins
// Crepe to it, so what that input does besides hold text is repeated here
// against the same composer state: Enter sends through the form, the / menu
// reads the keys and the caret, a pasted file becomes an attachment, and the
// cursor comes back after a send or a thread switch. The text itself stays in
// assistant-ui's composer, so everything that reads or writes it keeps working.
import {
  unstable_useComposerInput,
  unstable_useTriggerPopoverAriaProps,
  unstable_useTriggerPopoverRootContextOptional,
  useAui,
  useThreadViewportStore,
} from '@assistant-ui/react'
import type { TriggerItem } from '@assistant-ui/react'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import {
  editorViewOptionsCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from '@milkdown/kit/core'
import { uploadPlugin } from '@milkdown/kit/plugin/upload'
import { remarkPreserveEmptyLinePlugin } from '@milkdown/kit/preset/commonmark'
import { Plugin, PluginKey, Selection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Serializer } from '@milkdown/kit/transformer'
import { $prose } from '@milkdown/kit/utils'
import { Milkdown, MilkdownProvider } from '@milkdown/react'
import type { Link, Text } from 'mdast'
import { defaultHandlers } from 'mdast-util-to-markdown'
import type { Handle } from 'mdast-util-to-markdown'
import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react'
import type { ClipboardEvent, FocusEvent, KeyboardEvent } from 'react'
import { useCrepeMarkdown } from '@/components/notes/crepe-markdown'
import { cn } from '@/lib/utils'

type Popover = NonNullable<
  ReturnType<typeof unstable_useTriggerPopoverRootContextOptional>
>
type Trigger = Parameters<
  Parameters<Popover['subscribeLifecycle']>[0]['added']
>[0]

/** The serializer closes a document with a line break the composer's text does not carry. */
const asText = (markdown: string) => markdown.replace(/\n+$/, '')

/** A link that reads as its own address goes out as the address it was typed or pasted as. */
const link: Handle = (node: Link, parent, state, info) => {
  const [only] = node.children
  const bare =
    !node.title &&
    node.children.length === 1 &&
    only?.type === 'text' &&
    [only.value, `http://${only.value}`, `mailto:${only.value}`].includes(
      node.url,
    )
  return bare ? only.value : defaultHandlers.link(node, parent, state, info)
}

/** Stands where the caret is while the document is written out; nobody types it. */
const CARET = ''

/**
 * Where the caret is in the composer's text. The document is written out with
 * a stand-in typed at the caret, which lands where the next character would:
 * inside a mark the caret is at the end of, ahead of the marks that close it.
 * What precedes the stand-in is the text before the caret, as far as it agrees
 * with the composer's text.
 */
function caretOffset(view: EditorView, serialize: Serializer, text: string) {
  const { doc, selection, tr } = view.state
  const marked = serialize(tr.insertText(CARET, selection.head).doc)
  const found = marked.indexOf(CARET)
  const before =
    found < 0
      ? asText(serialize(doc.cut(0, selection.head)))
      : marked.slice(0, found)
  let at = 0
  while (at < before.length && before[at] === text[at]) at++
  return at
}

/** In a heading or a list item, the next line of Markdown is another block. */
function nextLineIsBlock(view: EditorView) {
  const { $head } = view.state.selection
  for (let depth = $head.depth; depth > 0; depth--) {
    const { name } = $head.node(depth).type
    if (name === 'heading' || name === 'list_item') return true
  }
  return false
}

/** A line holding only a code fence, with the caret after it. */
function opensFence(view: EditorView) {
  const { $head, empty } = view.state.selection
  return (
    empty &&
    $head.parent.type.name === 'paragraph' &&
    $head.parentOffset === $head.parent.content.size &&
    /^```[a-z]*$/.test($head.parent.textContent)
  )
}

/** The editor's own Enter: a new paragraph, the next list item, or a code block. */
const editorEnter = (view: EditorView) =>
  view.someProp('handleKeyDown', (handle) =>
    handle(view, new window.KeyboardEvent('keydown', { key: 'Enter' })),
  )

function Editor({
  label,
  placeholder,
  autoFocus,
  onFocus,
  onBlur,
  className,
}: ComposerEditorProps) {
  const aui = useAui()
  const { value, setText, isDisabled } = unstable_useComposerInput()
  const popover = unstable_useTriggerPopoverRootContextOptional()
  const aria = unstable_useTriggerPopoverAriaProps()
  const crepeRef = useRef<Crepe>(undefined)
  const viewRef = useRef<EditorView>(undefined)
  const serializeRef = useRef<Serializer>(undefined)
  const wrapperRef = useRef<HTMLDivElement>(null)

  /** Tells the / menu where the caret is, as the text area's selection did. */
  const place = (view: EditorView) => {
    const serialize = serializeRef.current
    const triggers = popover?.getTriggers()
    if (!serialize || !triggers?.size) return
    const at = caretOffset(view, serialize, aui.composer.getState().text)
    for (const { resource } of triggers.values()) resource.setCursorPosition(at)
  }

  const focusEnd = () => {
    const view = viewRef.current
    if (!view || !autoFocus || isDisabled) return
    view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)))
    view.focus()
  }

  // The editor is built once; it calls the latest of these.
  const live = useRef({ place, focusEnd })
  useLayoutEffect(() => {
    live.current = { place, focusEnd }
  })

  useCrepeMarkdown({
    markdown: value,
    onChange: setText,
    read: asText,
    build: (root, editor) => {
      const crepe = new Crepe({
        root,
        defaultValue: editor.markdown,
        // A message has no use for block handles and their slash menu (which
        // would open over the / tools menu), image blocks, tables or LaTeX.
        features: {
          [Crepe.Feature.BlockEdit]: false,
          [Crepe.Feature.ImageBlock]: false,
          [Crepe.Feature.Table]: false,
          [Crepe.Feature.Latex]: false,
        },
        featureConfigs: {
          [Crepe.Feature.Placeholder]: { text: placeholder ?? '', mode: 'doc' },
        },
      })
      crepe.editor
        .config((ctx) => {
          ctx.update(editorViewOptionsCtx, (options) => ({
            ...options,
            attributes: () => ({
              role: 'textbox',
              'aria-multiline': 'true',
              'aria-label': label,
              ...(placeholder ? { 'aria-placeholder': placeholder } : {}),
              ...(crepe.readonly ? { 'aria-disabled': 'true' } : {}),
              enterkeyhint: 'send',
            }),
          }))
          ctx.update(remarkStringifyOptionsCtx, (options) => ({
            ...options,
            handlers: {
              ...options.handlers,
              // Text goes out as it was typed. Escaping it would send
              // backslashes nobody wrote and break a `:tool[name]` pick.
              text: (node: Text) => node.value,
              // Shift+Enter is one line break in the text, as it always was.
              break: () => '\n',
              link,
            },
          }))
        })
        .use(
          $prose((ctx) => {
            return new Plugin({
              key: new PluginKey('theorem-composer'),
              view: (view) => {
                viewRef.current = view
                serializeRef.current = ctx.get(serializerCtx)
                return {
                  // The composer's text follows every edit at once, so Enter
                  // sends what is on screen; Milkdown's own listener waits.
                  update: (current, before) => {
                    const edited = !before.doc.eq(current.state.doc)
                    if (edited)
                      editor.report(
                        asText(ctx.get(serializerCtx)(current.state.doc)),
                      )
                    if (current.composing) return
                    if (edited || !before.selection.eq(current.state.selection))
                      live.current.place(current)
                  },
                  destroy: () => {
                    viewRef.current = undefined
                  },
                }
              },
            })
          }),
        )
      // An empty line is an empty line, not a `<br />`, and a dropped or
      // pasted file is an attachment, not an image in the text.
      void crepe.editor.remove(remarkPreserveEmptyLinePlugin)
      void crepe.editor.remove(uploadPlugin)
      crepe.setReadonly(isDisabled)
      crepe.on((listener) => listener.mounted(() => live.current.focusEnd()))
      crepeRef.current = crepe
      return crepe
    },
  })

  useEffect(() => {
    crepeRef.current?.setReadonly(isDisabled)
  }, [isDisabled])

  // Sending from a code block clears the block the cursor was in, and the
  // cursor with it; it stays in the input, as it did in the text area.
  const sentFromHere = useRef(false)
  useEffect(() => {
    if (!sentFromHere.current) return
    sentFromHere.current = false
    const view = viewRef.current
    if (view && !view.hasFocus()) view.focus()
  }, [value])

  // The cursor comes back to the thread's composer when the thread changes,
  // when the person jumps to the latest message, and when a run starts unless
  // they have put it somewhere else.
  const viewport = useThreadViewportStore({ optional: true })
  useEffect(() => {
    if (aui.composer.getState().type !== 'thread') return
    const onRunStart = () => {
      const wrapper = wrapperRef.current
      const active = document.activeElement
      if (!wrapper || active === viewRef.current?.dom) return
      const thread = wrapper.closest('[data-aui-thread-root]')
      const elsewhere =
        active &&
        active !== document.body &&
        !wrapper.closest('[data-aui-composer-type]')?.contains(active) &&
        (!thread?.contains(active) ||
          active.closest('[data-aui-thread-root]') !== thread)
      if (!elsewhere) live.current.focusEnd()
    }
    const offSwitch = aui.on('threads.selectionChanged', () =>
      live.current.focusEnd(),
    )
    const offRun = aui.on('thread.runStart', onRunStart)
    const offScroll = viewport
      ?.getState()
      .onScrollToBottom(() => live.current.focusEnd())
    return () => {
      offSwitch()
      offRun()
      offScroll?.()
    }
  }, [aui, viewport])

  // The open / menu is announced on the input, as on the text area.
  const controls = aria['aria-controls']
  const active = aria['aria-activedescendant']
  useEffect(() => {
    const input = viewRef.current?.dom
    if (!input || !controls) return
    const set = {
      'aria-controls': controls,
      'aria-expanded': 'true',
      'aria-haspopup': 'listbox',
      ...(active ? { 'aria-activedescendant': active } : {}),
    }
    for (const [name, to] of Object.entries(set)) input.setAttribute(name, to)
    return () => {
      for (const name of Object.keys(set)) input.removeAttribute(name)
    }
  }, [controls, active])

  // A pick from the / menu replaces what was typed after the slash, in the
  // editor itself, so the caret and the formatting around it stay put.
  const pick = useEffectEvent(
    (char: string, item: TriggerItem, onInserted: () => void) => {
      const view = viewRef.current
      const serialize = serializeRef.current
      const trigger = popover?.getTriggers().get(char)
      if (!view || !serialize || !trigger?.matcher) return false
      if (trigger.behavior?.kind !== 'directive') return false
      const text = aui.composer.getState().text
      const at = caretOffset(view, serialize, text)
      const match = trigger.matcher(text, char, at)
      if (!match) return false
      const typed = text.slice(match.offset, match.endOffset)
      const { doc, selection } = view.state
      const from = selection.head - typed.length
      if (from < 0 || doc.textBetween(from, selection.head) !== typed)
        return false
      const spaced =
        selection.head < doc.content.size &&
        doc.textBetween(selection.head, selection.head + 1) === ' '
      const written = trigger.behavior.formatter.serialize(item)
      const tr = view.state.tr.insertText(
        spaced ? written : `${written} `,
        from,
        selection.head,
      )
      const after = tr.doc.resolve(from + written.length + 1)
      view.dispatch(tr.setSelection(Selection.near(after)))
      view.focus()
      onInserted()
      return true
    },
  )
  useEffect(() => {
    if (!popover) return
    const undo = new Map<string, () => void>()
    const added = (trigger: Trigger) => {
      undo.get(trigger.char)?.()
      undo.set(
        trigger.char,
        trigger.resource.registerSelectItemOverride((item, onInserted) =>
          pick(trigger.char, item, onInserted),
        ),
      )
    }
    const removed = (char: string) => {
      undo.get(char)?.()
      undo.delete(char)
    }
    for (const trigger of popover.getTriggers().values()) added(trigger)
    const off = popover.subscribeLifecycle({ added, removed })
    return () => {
      off()
      for (const char of [...undo.keys()]) removed(char)
    }
  }, [popover])

  // Ahead of the editor's own keys: the / menu's, then the composer's.
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    const view = viewRef.current
    if (!view || isDisabled) return
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    // A code block is its own CodeMirror; the link tooltip's field and the
    // code block's language search keep their keys.
    const inCode = (event.target as Element).closest('.cm-content') !== null
    if (!inCode && event.target !== view.dom) return

    for (const { resource } of popover?.getTriggers().values() ?? [])
      if (resource.handleKeyDown(event)) {
        event.stopPropagation()
        return
      }

    switch (event.key) {
      case 'Tab':
        // Tab moves on from the input, as it did from the text area, rather
        // than indenting.
        event.stopPropagation()
        return
      case 'Escape':
        if (!aui.composer.getState().canCancel) return
        event.preventDefault()
        event.stopPropagation()
        aui.composer.cancel()
        // Leaving an edit puts the cursor back in the thread's own composer.
        if (aui.composer.getState().type === 'edit')
          event.currentTarget
            .closest('[data-aui-thread-root]')
            ?.querySelector<HTMLElement>(
              '[data-aui-composer-type="thread"] .ProseMirror',
            )
            ?.focus({ preventScroll: true })
        return
      case 'Enter':
        break
      default:
        return
    }

    const thread = aui.thread.getState()
    const { queue } = thread.capabilities
    if (event.shiftKey && (event.ctrlKey || event.metaKey)) {
      if (!queue || !aui.composer.getState().canSend) return
      event.preventDefault()
      event.stopPropagation()
      aui.composer.send({ steer: true })
      return
    }
    if (event.shiftKey) {
      // Milkdown's Shift+Enter breaks the line; in a heading or a list item
      // the next line is a new block, which is the editor's Enter.
      if (inCode || !nextLineIsBlock(view)) return
      event.preventDefault()
      event.stopPropagation()
      editorEnter(view)
      return
    }
    // While a run that takes no queued message is going, Enter is a new line.
    if (thread.isRunning && !queue && thread.voice === undefined) return
    // ``` and Enter opens a code block, as it does wherever Markdown is typed.
    if (!inCode && opensFence(view)) return
    event.preventDefault()
    event.stopPropagation()
    sentFromHere.current = inCode
    event.currentTarget.closest('form')?.requestSubmit()
  }

  const onPasteCapture = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files)
    if (!files.length || !aui.thread.getState().capabilities.attachments) return
    event.preventDefault()
    event.stopPropagation()
    for (const file of files)
      // A refused file is reported by the composer's own error event.
      aui.composer.addAttachment(file).catch(() => undefined)
  }

  const within = (event: FocusEvent<HTMLDivElement>) =>
    event.currentTarget.contains(event.relatedTarget)

  return (
    <div
      ref={wrapperRef}
      className={cn('theorem-note theorem-composer', className)}
      onKeyDownCapture={onKeyDownCapture}
      onPasteCapture={onPasteCapture}
      onFocus={(event) => {
        if (!within(event)) onFocus?.()
      }}
      onBlur={(event) => {
        if (!within(event)) onBlur?.()
      }}
    >
      <Milkdown />
    </div>
  )
}

type ComposerEditorProps = {
  /** The input's accessible name. */
  label: string
  placeholder?: string
  /** Takes the cursor on mount, on a thread switch and when a run starts. */
  autoFocus?: boolean
  /** The cursor entered or left the editor as a whole. */
  onFocus?: () => void
  onBlur?: () => void
  className?: string
}

/**
 * The input of an assistant-ui composer as a Markdown editor: what is typed
 * formats as it is typed, and the composer's text is the Markdown. Rendered
 * inside `ComposerPrimitive.Root` in place of `ComposerPrimitive.Input`.
 */
export function ComposerEditor(props: ComposerEditorProps) {
  return (
    <MilkdownProvider>
      <Editor {...props} />
    </MilkdownProvider>
  )
}
