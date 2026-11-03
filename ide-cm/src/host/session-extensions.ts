// SOURCING: @codemirror/state and @codemirror/view — a Facet carries the session's history into
// the editor state, a transactionFilter repairs edits that would break the host's scalar unit,
// MatchDecorator hides carriage returns, and domEventHandlers take the browser's own undo events.
// Nothing here is a history or text-model implementation: undo is the SDK session's, and the
// UTF-16 to scalar conversion is the SDK's (`session-sync.ts`).

import { ChangeSet, EditorSelection, EditorState, Facet, Prec, Text, type Annotation, type Extension, type Transaction } from '@codemirror/state'
import { Decoration, EditorView, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

/** The session-backed undo of one document, as the editor commands see it. */
export interface SessionHistory {
  undo(): boolean
  redo(): boolean
}

/** Present in an editor's state when its document is edited through a shared session. */
export const sessionHistory = Facet.define<SessionHistory, SessionHistory | null>({
  combine: (values) => values[0] ?? null,
})

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff

/** Lone surrogates in `text` cannot be Unicode scalars; U+FFFD stands for them. */
function wellFormed(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (isHigh(code) && i + 1 < text.length && isLow(text.charCodeAt(i + 1))) {
      out += text[i]! + text[i + 1]!
      i += 1
    } else if (isHigh(code) || isLow(code)) {
      out += '�'
    } else {
      out += text[i]!
    }
  }
  return out
}

/** True when the text is mostly CRLF: the first line break decides, as editors usually do. */
export function usesCrlf(text: { toString(): string }): boolean {
  const s = text.toString()
  const at = s.indexOf('\n')
  return at > 0 && s.charCodeAt(at - 1) === 13
}

export interface TransactionFilterOptions {
  /** Transactions that came from the session or another view; they are already well formed. */
  external?: (tr: Transaction) => boolean
}

/**
 * The host edits and stores Unicode scalars, so an edit may not cut a surrogate pair in two or
 * insert half of one. A deletion that starts or ends inside a pair is widened to the whole pair;
 * an insertion inside a pair moves to after it; a lone surrogate in inserted text becomes U+FFFD.
 * If widening would make two changes overlap the transaction is dropped rather than guessed at.
 *
 * In a CRLF document a typed line break is inserted as CRLF, so the file keeps one convention
 * (the editor counts a lone `\n`; the host's text keeps the `\r`).
 */
export function scalarBoundaryFilter({ external = () => false }: TransactionFilterOptions = {}): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || external(tr)) return tr
    const doc = tr.startState.doc
    const crlf = usesCrlf(doc)
    const unit = (at: number) => (at >= 0 && at < doc.length ? doc.sliceString(at, at + 1).charCodeAt(0) : -1)
    const inPair = (at: number) => isHigh(unit(at - 1)) && isLow(unit(at))
    const specs: { from: number; to: number; insert: Text }[] = []
    let rewritten = false
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      let from = fromA
      let to = toA
      if (from === to) {
        if (inPair(from)) {
          from += 1
          to = from
        }
      } else {
        if (inPair(from)) from -= 1
        if (inPair(to)) to += 1
      }
      const original = inserted.toString()
      let insert = wellFormed(original)
      if (crlf) insert = insert.replace(/\r?\n/g, '\r\n')
      if (from !== fromA || to !== toA || insert !== original) rewritten = true
      // A string insert would be split on \r\n and lose the \r; a Text keeps lines as given.
      specs.push({ from, to, insert: Text.of(insert.split('\n')) })
    })
    if (!rewritten) return tr
    for (let i = 1; i < specs.length; i += 1) if (specs[i]!.from < specs[i - 1]!.to) return []
    const changes = ChangeSet.of(specs, doc.length)
    // A selection the transaction named explicitly may now lie outside the document or inside a
    // pair; keep it in range and on a boundary. Otherwise CodeMirror maps the old one itself.
    let selection: EditorSelection | undefined
    if (tr.selection) {
      const next = changes.apply(doc)
      const snap = (pos: number) => {
        const at = Math.max(0, Math.min(pos, next.length))
        const high = at > 0 ? next.sliceString(at - 1, at).charCodeAt(0) : -1
        const low = at < next.length ? next.sliceString(at, at + 1).charCodeAt(0) : -1
        return isHigh(high) && isLow(low) ? at - 1 : at
      }
      selection = EditorSelection.create(
        tr.selection.ranges.map((range) => EditorSelection.range(snap(range.anchor), snap(range.head))),
        tr.selection.mainIndex,
      )
    }
    return {
      changes,
      ...(selection ? { selection } : {}),
      effects: tr.effects,
      // Real, but left out of the published types: a transaction rebuilt from a spec keeps the
      // original's annotations (user event, history, remote).
      annotations: (tr as Transaction & { annotations: readonly Annotation<unknown>[] }).annotations,
      scrollIntoView: tr.scrollIntoView,
    }
  })
}

/**
 * Browser-level undo and redo (Edit menu, context menu, `beforeinput`) go to the session, ahead
 * of the history extension's own handler.
 */
const sessionInputHistory: Extension = Prec.highest(
  EditorView.domEventHandlers({
    beforeinput(event, view) {
      const history = view.state.facet(sessionHistory)
      if (!history) return false
      const type = (event as InputEvent).inputType
      if (type !== 'historyUndo' && type !== 'historyRedo') return false
      event.preventDefault()
      if (type === 'historyUndo') history.undo()
      else history.redo()
      return true
    },
  }),
)

/**
 * Carriage returns of a CRLF document stay in the text (offsets must match the host's) but are
 * not drawn, and the caret steps over them.
 */
const carriageReturns = new MatchDecorator({
  regexp: /\r(?=\n|$)/g,
  decoration: Decoration.replace({}),
})

const hideCarriageReturns = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = carriageReturns.createDeco(view)
    }
    update(update: ViewUpdate) {
      this.decorations = carriageReturns.updateDeco(update, this.decorations)
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
  },
)

/** Everything a session-backed document adds to its editor. */
export function sessionEditing(history: SessionHistory, options?: TransactionFilterOptions): Extension {
  return [sessionHistory.of(history), scalarBoundaryFilter(options), sessionInputHistory, hideCarriageReturns]
}
