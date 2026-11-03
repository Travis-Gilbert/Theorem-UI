// SOURCING: plain mapping from the ask store's asks to the markup plugin's
// items (markup.ts), and back from its ranges to quotes (selection.ts).
//
// What a note's asks show in it: each ask's passage, the comments and
// highlights the agent left, and the edits it made, found by their new text.
import type { EditorState } from '@milkdown/kit/prose/state'
import type { Ask } from '@/lib/documents/ask-store'
import type { Mark, Quote } from '@/lib/documents/marks'
import { editItem, markupKey } from './markup'
import type { MarkupItem } from './markup'
import { quoteAt } from './selection'

type Edit = Extract<Mark, { kind: 'edit' }>

const isEdit = (mark: Mark): mark is Edit => mark.kind === 'edit'

function markItems(ask: Ask, mark: Mark): MarkupItem[] {
  if (mark.kind !== 'edit') {
    const quote = ask.quotes?.[mark.markId] ?? mark.quote
    return [
      {
        id: mark.markId,
        kind: mark.kind,
        quote,
        near: ask.id,
        label: mark.body,
      },
    ]
  }
  return ask.edits[mark.markId] === 'applied'
    ? [{ ...editItem(mark), near: ask.id }]
    : []
}

export const markupItems = (asks: readonly Ask[]): MarkupItem[] =>
  asks.flatMap((ask) => [
    {
      id: ask.id,
      kind: 'passage' as const,
      quote: ask.quotes?.[ask.id] ?? ask.passage,
    },
    ...ask.marks.flatMap((mark) => markItems(ask, mark)),
  ])

/** The ask's edits it has not made yet: each is made once, as it arrives. */
export const pendingEdits = (ask: Ask): Edit[] =>
  ask.marks.filter(isEdit).filter((edit) => !ask.edits[edit.markId])

/** The ask's edits it made, for its note's Undo and Reapply. */
export const madeEdits = (ask: Ask): Edit[] =>
  ask.marks
    .filter(isEdit)
    .filter(
      (edit) => ask.edits[edit.markId] && ask.edits[edit.markId] !== 'missing',
    )

/**
 * What the agent marked, in a line: the marks the note holds by kind, and
 * those it does not (`found` holds the marks anchored in it) as not found.
 */
export function markSummary(ask: Ask, found: ReadonlySet<string>) {
  const lost = (mark: Mark) =>
    mark.kind === 'edit'
      ? ask.edits[mark.markId] === 'missing'
      : !found.has(mark.markId)
  const count = (kind: Mark['kind']) =>
    ask.marks.filter((mark) => mark.kind === kind && !lost(mark)).length
  const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`
  const missing = ask.marks.filter(lost).length
  return [
    count('comment') && plural(count('comment'), 'comment'),
    count('highlight') && plural(count('highlight'), 'highlight'),
    count('edit') && `changed ${plural(count('edit'), 'place')}`,
    missing && `${missing} not found`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Each ask whose passage, or a comment or highlight of whose, reads
 * differently where it now is, rewritten by an edit or by the person, with
 * all its quotes as they should be kept: the ones that find each there next
 * time.
 */
export function movedQuotes(
  asks: readonly Ask[],
  state: EditorState,
): Array<{ id: string; quotes: Record<string, Quote> }> {
  const ranges = markupKey.getState(state)?.ranges
  return asks.flatMap((ask) => {
    const quotes = { ...ask.quotes }
    let moved = false
    for (const item of markupItems([ask])) {
      const range = ranges?.get(item.id)
      if (item.kind === 'edit' || !range) continue
      const quote = quoteAt(state.doc, range.from, range.to)
      if (quote.exact === item.quote.exact) continue
      quotes[item.id] = quote
      moved = true
    }
    return moved ? [{ id: ask.id, quotes }] : []
  })
}
