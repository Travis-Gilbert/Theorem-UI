// `@codemirror/commands` as the editor imports it (a Vite alias points here): the package itself,
// except that undo and redo go to the shared session when the editor's document has one. Every
// importer gets this, including the keymaps built from `historyKeymap` and the Vim bindings, so
// the editor source needs no change. A document without a session (the diff and merge editors)
// keeps CodeMirror's own history.

import type { KeyBinding } from '@codemirror/view'
import type { StateCommand } from '@codemirror/state'
import {
  historyKeymap as cmHistoryKeymap,
  redo as cmRedo,
  undo as cmUndo,
} from '../../node_modules/@codemirror/commands/dist/index.js'
import { sessionHistory } from './session-extensions'

export * from '../../node_modules/@codemirror/commands/dist/index.js'

export const undo: StateCommand = (target) => {
  const session = target.state.facet(sessionHistory)
  return session ? session.undo() : cmUndo(target)
}

export const redo: StateCommand = (target) => {
  const session = target.state.facet(sessionHistory)
  return session ? session.redo() : cmRedo(target)
}

export const historyKeymap: readonly KeyBinding[] = cmHistoryKeymap.map((binding) =>
  binding.run === cmUndo ? { ...binding, run: undo } : binding.run === cmRedo ? { ...binding, run: redo } : binding,
)
