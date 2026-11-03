// SOURCING: zustand's vanilla store (the shell's state library, used here
// without React) for what one editor's markup plugin reports to its margin
// and ask popover; ProseMirror's keymap for the ask shortcut.
//
// A note's editor on the document screen has one host. The markup plugin
// tells it of every change, so the margin lays its notes out again, and asks
// it for the elements inline notes render into; the toolbar, the shortcut and
// the context menu open the ask popover through it.
import { keymap } from '@milkdown/kit/prose/keymap'
import type { EditorView } from '@milkdown/kit/prose/view'
import { createStore } from 'zustand/vanilla'
import { askRange } from './selection'

/** A part of the note being asked about, and where the popover opens. */
export type AskTarget = {
  from: number
  to: number
  at: { x: number; y: number }
}

type HostState = {
  view: EditorView | undefined
  /** Bumped on every update of the view, so the margin measures again. */
  tick: number
  asking: AskTarget | undefined
}

export function createMarkupHost() {
  const store = createStore<HostState>(() => ({
    view: undefined,
    tick: 0,
    asking: undefined,
  }))
  const elements = new Map<string, HTMLElement>()
  return {
    store,
    elements,
    update: (view: EditorView) =>
      store.setState((s) => ({ view, tick: s.tick + 1 })),
    /** The element an inline note renders into, the same one each time. */
    element(id: string) {
      let element = elements.get(id)
      if (!element) {
        element = document.createElement('div')
        element.className = 'theorem-inline-note'
        element.contentEditable = 'false'
        elements.set(id, element)
      }
      return element
    },
    /**
     * Opens the ask popover on the selection, or the block at `pos`, at the
     * pointer or under the text. False when there is nothing to ask about.
     */
    ask(view: EditorView, pos?: number, at?: { x: number; y: number }) {
      const range = askRange(view.state, pos)
      if (!range) return false
      const below = view.coordsAtPos(range.to)
      store.setState({
        asking: { ...range, at: at ?? { x: below.left, y: below.bottom } },
      })
      return true
    },
    close: () => store.setState({ asking: undefined }),
  }
}

export type MarkupHost = ReturnType<typeof createMarkupHost>

/** Mod-Alt-m asks about the selection, or the block the cursor is in. */
export const askKeymap = (host: MarkupHost) =>
  keymap({
    'Mod-Alt-m': (_state, _dispatch, view) => (view ? host.ask(view) : false),
  })
