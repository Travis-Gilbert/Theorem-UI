// SOURCING: ProseMirror's Plugin, PluginKey and DecorationSet (as
// prosemirror-search keeps its own) for what the agent marked, mapped
// through every change; a plain transaction for the agent's edits, so
// prosemirror-history undoes each as one step; the editor's Markdown parser
// (Milkdown's parserCtx, passed in) for edits that hold links or paragraphs;
// selection.ts to anchor quotes.
//
// The document screen shows each ask's passage, the agent's comments and
// highlights, and the text it changed, as decorations over the note. None of
// it is written into the note except the edits, which are the agent's
// changes to the text itself.
import { Slice } from '@milkdown/kit/prose/model'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type {
  Command,
  EditorState,
  Transaction,
} from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Mark, Quote } from '@/lib/documents/marks'
import { anchorQuote, blockAt, plainText } from './selection'

export type MarkupItem = {
  id: string
  /** An ask's passage, a mark the agent left, or text it changed. */
  kind: 'passage' | 'comment' | 'highlight' | 'edit'
  quote: Quote
  /** The item whose place a match nearest to is preferred: the ask's passage. */
  near?: string
  /** A highlight's label, shown as its title. */
  label?: string
}

type Range = { from: number; to: number }

type MarkupState = {
  items: readonly MarkupItem[]
  /** Where each item is found; an item not here is missing from the note. */
  ranges: ReadonlyMap<string, Range>
  /** The ask whose note is being read, its passage drawn stronger. */
  active: string | undefined
  /** Whether notes show under their passages, not in the margin. */
  inline: boolean
  decorations: DecorationSet
}

type Meta = {
  items?: readonly MarkupItem[]
  active?: string | null
  inline?: boolean
  /** Edits just made, and where each put its text. */
  placed?: ReadonlyArray<{ item: MarkupItem; range: Range }>
}

export const markupKey = new PluginKey<MarkupState>('theorem-markup')

const CLASSES: Record<MarkupItem['kind'], string> = {
  passage: 'theorem-ask-passage',
  comment: 'theorem-mark-comment',
  highlight: 'theorem-mark-highlight',
  edit: 'theorem-mark-edit',
}

/** Passages first, so the marks can prefer the place their ask was about. */
function anchor(
  state: EditorState,
  items: readonly MarkupItem[],
  kept: ReadonlyMap<string, Range>,
) {
  const ranges = new Map<string, Range>()
  const ordered = [...items].sort(
    (a, b) => Number(a.kind !== 'passage') - Number(b.kind !== 'passage'),
  )
  for (const item of ordered) {
    const range =
      kept.get(item.id) ??
      anchorQuote(
        state,
        item.quote,
        item.near ? ranges.get(item.near)?.from : undefined,
      )
    if (range) ranges.set(item.id, range)
  }
  return ranges
}

/** The end of the top-level block that holds `pos`, where an inline note goes. */
const blockEnd = (state: EditorState, pos: number) =>
  state.doc.resolve(pos).after(1)

function decorate(
  state: EditorState,
  { items, ranges, active, inline }: Omit<MarkupState, 'decorations'>,
  widget: ((id: string) => HTMLElement) | undefined,
) {
  const decorations: Decoration[] = []
  for (const item of items) {
    const range = ranges.get(item.id)
    if (!range) continue
    // An edit shows only while its text is still the agent's; a deletion has
    // none to show.
    if (
      item.kind === 'edit' &&
      (range.from === range.to ||
        plainText(state.doc, range.from, range.to) !== item.quote.exact)
    )
      continue
    const active_ = item.kind === 'passage' && item.id === active
    decorations.push(
      Decoration.inline(range.from, range.to, {
        class: active_ ? `${CLASSES[item.kind]} is-active` : CLASSES[item.kind],
        'data-markup': item.id,
        ...(item.label && { title: item.label }),
      }),
    )
    // An ask's note, or a comment, shows after its block when there is no margin.
    if (
      inline &&
      widget &&
      (item.kind === 'passage' || item.kind === 'comment')
    )
      decorations.push(
        Decoration.widget(blockEnd(state, range.to), () => widget(item.id), {
          key: `note:${item.id}`,
          side: 1,
          ignoreSelection: true,
          stopEvent: () => true,
        }),
      )
  }
  return DecorationSet.create(state.doc, decorations)
}

type MarkupSpec = {
  onUpdate?: (view: EditorView) => void
  widget?: (id: string) => HTMLElement
  /** The editor's Markdown parser, for edits that hold links or paragraphs. */
  parse?: (markdown: string) => ProseNode
}

/**
 * The markup plugin. `onUpdate` hears every change, so the margin can lay its
 * notes out again; `widget` gives the element an inline note renders into.
 */
export function markupPlugin({ onUpdate, widget, parse }: MarkupSpec = {}) {
  return new Plugin<MarkupState>({
    key: markupKey,
    parse,
    state: {
      init: (_config, state) => ({
        items: [],
        ranges: new Map(),
        active: undefined,
        inline: false,
        decorations: DecorationSet.create(state.doc, []),
      }),
      apply(tr, value, _old, state) {
        const meta = tr.getMeta(markupKey) as Meta | undefined
        if (!meta && !tr.docChanged) return value
        // Ranges follow the text. One whose text is gone is dropped, but for
        // a deletion, which has none, and a passage, whose ask keeps the
        // block the text was in, so its note still has a place.
        const kinds = new Map(value.items.map((item) => [item.id, item]))
        let ranges = new Map<string, Range>()
        for (const [id, range] of value.ranges) {
          const from = tr.mapping.map(range.from, 1)
          const to = tr.mapping.map(range.to, -1)
          const item = kinds.get(id)
          if (from < to) ranges.set(id, { from, to })
          else if (from === to && item?.kind === 'edit' && !item.quote.exact)
            ranges.set(id, { from, to })
          else if (item?.kind === 'passage') {
            const block = blockAt(state.doc, Math.min(from, to))
            if (block) ranges.set(id, block)
          }
        }
        let items = meta?.items ?? value.items
        if (meta?.items) ranges = anchor(state, items, ranges)
        for (const { item, range } of meta?.placed ?? []) {
          items = [...items.filter((known) => known.id !== item.id), item]
          ranges.set(item.id, range)
        }
        const next = {
          items,
          ranges,
          active:
            meta?.active === undefined
              ? value.active
              : (meta.active ?? undefined),
          inline: meta?.inline ?? value.inline,
        }
        return { ...next, decorations: decorate(state, next, widget) }
      },
    },
    props: {
      decorations: (state) => markupKey.getState(state)?.decorations,
    },
    view: (view) => {
      onUpdate?.(view)
      return { update: (next) => onUpdate?.(next) }
    },
  })
}

/** A transaction that sets what the markup shows; it changes no text. */
export const setMarkup = (state: EditorState, meta: Omit<Meta, 'placed'>) =>
  state.tr.setMeta(markupKey, meta).setMeta('addToHistory', false)

type Edit = Extract<Mark, { kind: 'edit' }>

/**
 * How an edit's text is found once made: its replacement, between the text
 * that stood either side of what it changed.
 */
export const editItem = (edit: Edit): MarkupItem => ({
  id: edit.markId,
  kind: 'edit',
  quote: {
    exact: edit.replacement,
    prefix: edit.quote.prefix,
    suffix: edit.quote.suffix,
  },
})

/**
 * Puts `text` in place of `from`–`to`. Plain text goes in as typed, keeping
 * the marks around it; text that holds links or paragraphs goes in as the
 * editor's own nodes, when the parser reads it back as written. Returns where
 * the text ends once put.
 */
function put(
  tr: Transaction,
  state: EditorState,
  text: string,
  from: number,
  to: number,
) {
  const steps = tr.steps.length
  const parse = (markupKey.get(state)?.spec as MarkupSpec | undefined)?.parse
  const doc = text ? parse?.(text) : undefined
  let nodes = !!doc && doc.childCount > 1
  doc?.firstChild?.forEach((child) => {
    if (!child.isText) nodes = true
  })
  if (doc && nodes && plainText(doc) === text)
    tr.replace(from, to, new Slice(doc.content, 1, 1))
  else tr.insertText(text, from, to)
  return tr.mapping.slice(steps).map(to, 1)
}

/**
 * Makes the agent's edits, near `near` when given, in one transaction, so a
 * reply's changes are one undo away. Edits whose text is not in the note, or
 * that overlap one already placed, are named missing.
 */
export const applyEdits =
  (edits: readonly Edit[], near?: number) =>
  (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const found: Array<{ edit: Edit } & Range> = []
    const missing: string[] = []
    for (const edit of edits) {
      const range = anchorQuote(state, edit.quote, near)
      const overlaps =
        range && found.some((f) => range.from < f.to && f.from < range.to)
      if (range && !overlaps) found.push({ edit, ...range })
      else missing.push(edit.markId)
    }
    // From the end of the note back, so each edit's place is still where found.
    found.sort((a, b) => b.from - a.from)
    const tr = state.tr
    const made = found.map(({ edit, from, to }) => {
      const end = put(tr, state, edit.replacement, from, to)
      return { edit, from, end, steps: tr.steps.length }
    })
    // Each edit's text, where the edits made after it moved it; a deletion
    // keeps the point it left, so its note can put the text back.
    const placed = made.map(({ edit, from, end, steps }) => {
      const later = tr.mapping.slice(steps)
      const range = { from: later.map(from, -1), to: later.map(end, 1) }
      return { item: editItem(edit), range }
    })
    if (found.length && dispatch)
      dispatch(tr.setMeta(markupKey, { placed } satisfies Meta))
    const applied = edits
      .map((edit) => edit.markId)
      .filter((id) => !missing.includes(id))
    return { applied, missing }
  }

/** One edit, as `applyEdits`; false when its text is not in the note. */
export const applyEdit =
  (edit: Edit, near?: number): Command =>
  (state, dispatch) =>
    applyEdits([edit], near)(state, dispatch).applied.length > 0

/** Whether the edit's text still stands in the note, as the agent wrote it. */
export function editShows(state: EditorState, edit: Edit) {
  const range = markupKey.getState(state)?.ranges.get(edit.markId)
  return (
    !!range && plainText(state.doc, range.from, range.to) === edit.replacement
  )
}

/**
 * Puts back what the edits changed, as the person's own undoable step. False
 * when none of them still shows its text.
 */
export const revertEdits =
  (edits: readonly Edit[]): Command =>
  (state, dispatch) => {
    const ranges = markupKey.getState(state)?.ranges
    const live = edits
      .flatMap((edit) => {
        const range = ranges?.get(edit.markId)
        return range && editShows(state, edit) ? [{ edit, ...range }] : []
      })
      .sort((a, b) => b.from - a.from)
    if (!live.length) return false
    const tr = state.tr
    for (const { edit, from, to } of live)
      put(tr, state, edit.quote.exact, from, to)
    dispatch?.(tr)
    return true
  }
