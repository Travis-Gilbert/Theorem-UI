// SOURCING: Milkdown's $node (the schema node and its Markdown runners),
// $inputRule and $command (prosemirror-inputrules and commands underneath),
// and its remark plugin slice. Milkdown picks the first schema node whose
// `parseMarkdown.match` accepts an mdast node, in registration order, and a
// node's `priority` only orders its parseDOM rules; so `.live` fences are told
// apart from other fences by a remark transformer placed first in the remark
// pipeline (format.ts), which runs before code_block's parser could claim them.
import { InitReady, remarkPluginsCtx } from '@milkdown/kit/core'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { $command, $inputRule, $node } from '@milkdown/kit/utils'
import type { LiveBlockSource } from './format'
import {
  LIVE_BLOCK_MDAST_TYPE,
  parseFenceInfo,
  remarkLiveBlocks,
  serializeLiveBlock,
} from './format'

export const LIVE_BLOCK_NODE = 'live_block'

/**
 * Marks a live block view's own controls (its header, source editor and
 * result): ProseMirror leaves events inside them alone.
 */
export const LIVE_BLOCK_CONTROLS = 'data-live-block-controls'

/** A live block's attributes: its Markdown, as written. */
export function liveBlockAttrs(node: ProseNode): LiveBlockSource {
  return {
    fence: String(node.attrs.fence),
    gap: String(node.attrs.gap),
    output: (node.attrs.output as string | null) ?? null,
  }
}

/**
 * The live block node. It is an atom: its fence and pinned output are kept as
 * written in attributes, and its node view edits them.
 */
export const liveBlockNode = $node(LIVE_BLOCK_NODE, () => ({
  group: 'block',
  atom: true,
  isolating: true,
  selectable: true,
  draggable: false,
  marks: '',
  attrs: {
    fence: { default: '```tsx {.live}\n```' },
    gap: { default: '\n\n' },
    output: { default: null },
  },
  parseDOM: [
    {
      tag: 'div[data-theorem-live]',
      getAttrs: (dom) => {
        const data = dom.dataset
        return {
          fence: data.fence ?? '',
          gap: data.gap ?? '\n\n',
          output: data.output ?? null,
        }
      },
    },
  ],
  toDOM: (node) => {
    const { fence, gap, output } = liveBlockAttrs(node)
    return [
      'div',
      {
        'data-theorem-live': '',
        'data-fence': fence,
        'data-gap': gap,
        ...(output === null ? {} : { 'data-output': output }),
      },
    ]
  },
  parseMarkdown: {
    match: (node) => node.type === LIVE_BLOCK_MDAST_TYPE,
    runner: (state, node, type) => {
      state.addNode(type, {
        fence: node.fence,
        gap: node.gap,
        output: node.output,
      })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === LIVE_BLOCK_NODE,
    runner: (state, node) => {
      state.addNode('html', undefined, serializeLiveBlock(liveBlockAttrs(node)))
    },
  },
}))

/** Puts the live-block transformer first in the remark pipeline. */
export const remarkLiveBlocksFirst: MilkdownPlugin = (ctx) => async () => {
  await ctx.wait(InitReady)
  const entry = { plugin: remarkLiveBlocks, options: {} }
  ctx.update(remarkPluginsCtx, (plugins) => [entry, ...plugins])
  return () => {
    ctx.update(remarkPluginsCtx, (plugins) =>
      plugins.filter((plugin) => plugin !== entry),
    )
  }
}

/**
 * Typing a fence opener with a `.live` attribute block, such as
 * "```tsx{.live #streak}" and a space, makes a live block. (Typing a space
 * right after the language makes an ordinary code block first.)
 */
export const liveBlockInputRule = $inputRule(
  (ctx) =>
    new InputRule(
      /^(`{3,}|~{3,})([a-z]+)\s*(\{[^}]*\})\s$/,
      (state, match, start, end) => {
        const [, marker = '```', lang = '', attributes = ''] = match
        const info = `${lang} ${attributes}`
        if (!parseFenceInfo(info)) return null
        const $start = state.doc.resolve(start)
        const type = liveBlockNode.type(ctx)
        const node = type.create({ fence: `${marker}${info}\n${marker}` })
        if (
          !$start
            .node(-1)
            .canReplaceWith($start.index(-1), $start.indexAfter(-1), type)
        )
          return null
        return state.tr.replaceRangeWith(
          $start.before(),
          Math.max($start.after(), end),
          node,
        )
      },
    ),
)

/** Inserts an empty live block of a kind at the selection. */
export const insertLiveBlockCommand = $command(
  'InsertLiveBlock',
  (ctx) =>
    (lang: string = 'tsx') =>
    (state, dispatch) => {
      const node = liveBlockNode
        .type(ctx)
        .create({ fence: `\`\`\`${lang} {.live}\n\`\`\`` })
      dispatch?.(state.tr.replaceSelectionWith(node).scrollIntoView())
      return true
    },
)

/** Everything the Markdown editor needs for live blocks, except the node view. */
export const liveBlockPlugins: Array<MilkdownPlugin> = [
  remarkLiveBlocksFirst,
  liveBlockNode,
  liveBlockInputRule,
  insertLiveBlockCommand,
].flat()
