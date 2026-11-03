// A CodeMirror view joined to a DocumentSession the way DocModel joins its views to the sync:
// local edits go to `sync.local`, the sync's remote changes come back annotated so they are not
// sent again. Used by the tests only.

import { Annotation, EditorState, type Extension, type Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { history } from '@codemirror/commands'
import type { DocumentConflict, DocumentSession } from '@theoremharness/sdk'
import { sessionEditing } from '../../src/host/session-extensions'
import { SessionDocSync, type SessionSyncHost } from '../../src/host/session-sync'

export const remote = Annotation.define<boolean>()

export interface Mounted {
  view: EditorView
  sync: SessionDocSync
  discarded: unknown[]
  conflicts: DocumentConflict[]
  states: number
  text(): string
  /** What the editor shows must always equal what the sync and the session hold. */
  assertInStep(): void
  destroy(): void
}

export function mount(
  session: DocumentSession,
  options: { filter?: boolean; now?: () => number; extensions?: Extension[] } = {},
): Mounted {
  const parent = document.createElement('div')
  document.body.append(parent)
  const out = { discarded: [] as unknown[], conflicts: [] as DocumentConflict[], states: 0 }
  let view!: EditorView
  const host: SessionSyncHost = {
    applyRemote: (changes) => view.dispatch({ changes, annotations: remote.of(true) }),
    onDiscarded: (reason) => out.discarded.push(reason),
    onConflict: (conflict) => out.conflicts.push(conflict),
    onState: () => {
      out.states += 1
    },
  }
  const sync = new SessionDocSync(session, host, options.now)
  const live = (): Extension => [
    history(),
    options.filter === false ? [] : sessionEditing(sync, { external: (tr) => !!tr.annotation(remote) }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !update.transactions.some((tr) => tr.annotation(remote))) sync.local(update.changes)
    }),
    ...(options.extensions ?? []),
  ]
  view = new EditorView({ parent, state: EditorState.create({ doc: sync.localText as Text, extensions: live() }) })
  const mounted: Mounted = {
    view,
    sync,
    ...out,
    text: () => view.state.doc.toString(),
    assertInStep() {
      if (view.state.doc.toString() !== session.text) {
        throw new Error(`editor ${JSON.stringify(view.state.doc.toString())} differs from session ${JSON.stringify(session.text)}`)
      }
      if (sync.localText.toString() !== session.text) throw new Error('sync.localText differs from the session')
    },
    destroy() {
      sync.dispose()
      view.destroy()
      parent.remove()
    },
  }
  // `out` arrays are shared by reference; `states` is read through the getter below.
  Object.defineProperty(mounted, 'states', { get: () => out.states })
  return mounted
}

/** The same text with the host's units: a Unicode-scalar splice, for expected values. */
export function spliceScalars(text: string, start: number, end: number, insert: string): string {
  const chars = [...text]
  chars.splice(start, end - start, ...insert)
  return chars.join('')
}
