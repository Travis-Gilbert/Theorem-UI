// SOURCING: Milkdown's $remark and $node, unist-util-visit, the shape handlers/markdown/syntax uses for its wiki embeds. A theorem-embed fence is one atom in the editor, so a viewer can be React with its context (@prosemirror-adapter/react) where Crepe's code-block preview would only take sanitized static HTML; it is written back as the same fence.
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { RemarkPluginRaw } from '@milkdown/kit/transformer'
import { $node, $remark } from '@milkdown/kit/utils'
import type { Code } from 'mdast'
import { visit } from 'unist-util-visit'
import { EMBED_LANGUAGE, parseEmbed } from '@/lib/theorem/embeds'

const NODE = 'theoremBlock'
const MDAST = 'theoremBlock'

/** Fences that name a Theorem object leave the code path; anything else stays code. */
const remarkBlocks: RemarkPluginRaw<undefined> = () => (tree) => {
  visit(tree, 'code', (node: Code, index, parent) => {
    if (node.lang !== EMBED_LANGUAGE || !parent || index === undefined) return
    if (!parseEmbed(node.value)) return
    ;(parent.children as unknown[])[index] = { type: MDAST, value: node.value }
  })
}

export const remarkTheoremBlocks = $remark('theoremBlocks', () => remarkBlocks)

export const theoremBlockNode = $node(NODE, () => ({
  group: 'block',
  atom: true,
  isolating: true,
  selectable: true,
  draggable: true,
  marks: '',
  attrs: { ref: { default: '' } },
  parseDOM: [
    {
      tag: 'div[data-theorem-block]',
      getAttrs: (dom) => ({ ref: dom.dataset.theoremBlock ?? '' }),
    },
  ],
  toDOM: (node: ProseNode) => [
    'div',
    { 'data-theorem-block': String(node.attrs.ref) },
  ],
  parseMarkdown: {
    match: (node) => node.type === MDAST,
    runner: (state, node, type) => {
      state.addNode(type, { ref: (node as unknown as Code).value })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === NODE,
    runner: (state, node) => {
      state.addNode('code', undefined, String(node.attrs.ref), {
        lang: EMBED_LANGUAGE,
      })
    },
  },
}))
