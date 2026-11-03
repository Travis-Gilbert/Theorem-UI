// SOURCING: ProseMirror's Node (textBetween, forEach, descendants) for the
// text and blocks a selection covers, links kept as written, and for finding
// a quote in each block's text; the W3C TextQuoteSelector's prefix and suffix
// to choose between matches. Not prosemirror-search: it reads every inline
// node as one U+FFFC, so a quote with a link in it, written as the agent sees
// it, never matches.
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { EditorState } from '@milkdown/kit/prose/state'
import { blocksPart } from '@/lib/documents/passage'
import type { Excerpt } from '@/lib/documents/passage'
import type { Quote } from '@/lib/documents/marks'
import { wikiText } from './syntax'

/** How much text either side of a quote tells its matches apart. */
const CONTEXT = 32

/**
 * The document's text as the agent is given it and quotes it back: blocks a
 * blank line apart, links as written.
 */
export const plainText = (doc: ProseNode, from = 0, to = doc.content.size) =>
  doc.textBetween(from, to, '\n\n', wikiText)

/** What the person selected from `from` to `to`, or undefined for nothing. */
export function proseExcerpt(
  doc: ProseNode,
  from: number,
  to: number,
): Excerpt | undefined {
  const text = plainText(doc, from, to)
  if (!text.trim()) return undefined
  const blocks: Array<{ type: string; whole: boolean }> = []
  doc.forEach((node, start) => {
    const end = start + node.nodeSize
    if (end > from && start < to)
      blocks.push({
        type: node.type.name,
        whole: from <= start + 1 && to >= end - 1,
      })
  })
  return { part: blocksPart(blocks), text }
}

/** The selection from `from` to `to` as a quote, with the text around it. */
export function quoteAt(doc: ProseNode, from: number, to: number): Quote {
  return {
    exact: plainText(doc, from, to),
    prefix: plainText(doc, 0, from).slice(-CONTEXT),
    suffix: plainText(doc, to).slice(0, CONTEXT),
  }
}

/** How many characters `a` and `b` share at their ends (or starts). */
function shared(a: string, b: string, atEnd: boolean) {
  let n = 0
  const max = Math.min(a.length, b.length)
  while (
    n < max &&
    (atEnd ? a[a.length - 1 - n] === b[b.length - 1 - n] : a[n] === b[n])
  )
    n++
  return n
}

/**
 * Where `quote` is in the document. Of several matches, the one whose
 * surroundings agree most with the quote's, then the one nearest `near`. A
 * quote across blocks runs from its first block's text to its last's.
 */
export function anchorQuote(
  state: EditorState,
  quote: Quote,
  near?: number,
): { from: number; to: number } | undefined {
  const [first, ...rest] = quote.exact
    .split('\n\n')
    .filter((text) => text.trim())
  const last = rest.at(-1)
  if (first && last) {
    const head = anchorIn(state, { exact: first, prefix: quote.prefix }, near)
    const tail =
      head && anchorIn(state, { exact: last, suffix: quote.suffix }, head.to)
    return head && tail && tail.from > head.to
      ? { from: head.from, to: tail.to }
      : undefined
  }
  return anchorIn(state, quote, near)
}

/**
 * Each match of `exact` within one block, in the block's text as plainText
 * gives it, so a link matches as written. A match that takes in part of a
 * link takes the whole link.
 */
function matches(doc: ProseNode, exact: string) {
  const found: Array<{ from: number; to: number }> = []
  doc.descendants((block, start) => {
    if (!block.isTextblock) return true
    // The document position of each character of the block's text.
    const at: number[] = []
    let text = ''
    block.forEach((child, offset) => {
      const pos = start + 1 + offset
      const part = child.isText ? (child.text ?? '') : wikiText(child)
      for (let i = 0; i < part.length; i++)
        at.push(child.isText ? pos + i : pos)
      text += part
    })
    for (let i = text.indexOf(exact); i >= 0; i = text.indexOf(exact, i + 1))
      found.push({
        from: at[i] ?? start,
        to: (at[i + exact.length - 1] ?? start) + 1,
      })
    return false
  })
  return found
}

function anchorIn(
  state: EditorState,
  quote: Quote,
  near?: number,
): { from: number; to: number } | undefined {
  if (!quote.exact) return undefined
  const { doc } = state
  const score = ({ from, to }: { from: number; to: number }) =>
    (quote.prefix
      ? shared(
          plainText(doc, Math.max(0, from - CONTEXT * 2), from),
          quote.prefix,
          true,
        )
      : 0) +
    (quote.suffix
      ? shared(
          plainText(doc, to, Math.min(doc.content.size, to + CONTEXT * 2)),
          quote.suffix,
          false,
        )
      : 0)
  let best: { from: number; to: number; score: number } | undefined
  for (const match of matches(doc, quote.exact)) {
    const candidate = { ...match, score: score(match) }
    const closer =
      near !== undefined &&
      best &&
      Math.abs(candidate.from - near) < Math.abs(best.from - near)
    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score && closer)
    )
      best = candidate
  }
  return best && { from: best.from, to: best.to }
}

/**
 * What an ask is about: the selection, or with nothing selected (or a click
 * at `pos` outside it) the block there. Undefined for a block with no text.
 */
export function askRange(
  state: EditorState,
  pos?: number,
): { from: number; to: number } | undefined {
  const { from, to, empty } = state.selection
  if (!empty && (pos === undefined || (pos >= from && pos <= to)))
    return { from, to }
  const $pos = state.doc.resolve(pos ?? from)
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (!$pos.node(depth).isTextblock) continue
    const block = { from: $pos.start(depth), to: $pos.end(depth) }
    return block.to > block.from ? block : undefined
  }
  return undefined
}
