// SOURCING: the workspace parser's mdast (parseTree, the note's own GFM and
// wiki syntax) and mdast-util-to-string for each block's text.
//
// A margin note is laid out by pretext, which measures plain text in one
// font, so the agent's reply is shown as plain paragraphs: its emphasis,
// links and code drop to their text, and a list keeps a line per item.
import type { List, RootContent } from 'mdast'
import { toString } from 'mdast-util-to-string'
import { parseTree } from '#/server/desktop/workspace/markdown'

const listLines = (list: List) =>
  list.children.map((item, index) =>
    list.ordered
      ? `${(list.start ?? 1) + index}. ${toString(item)}`
      : `• ${toString(item)}`,
  )

const blockLines = (block: RootContent) =>
  block.type === 'list' ? listLines(block) : [toString(block)]

/** The reply's paragraphs as plain text, in order. */
export function replyBlocks(markdown: string): string[] {
  return parseTree(markdown)
    .children.flatMap(blockLines)
    .map((line) => line.trim())
    .filter(Boolean)
}
