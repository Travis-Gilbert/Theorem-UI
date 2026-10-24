// SOURCING: Milkdown's composables ($remark, $node, $inputRule, $ctx) over
// @flowershow/remark-wiki-link (wikilinks and ![[embeds]], parsed and
// written) and @moritzrs/micromark-extension-ofm-callout with
// @moritzrs/mdast-util-ofm-callout (Obsidian callouts, parsed). Callouts are
// written by a handler adapted from that package's, which always writes the
// default title; this one leaves a title out when the note left it out.
import { remarkStringifyOptionsCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { RemarkPluginRaw } from '@milkdown/kit/transformer'
import { $ctx, $inputRule, $node, $remark } from '@milkdown/kit/utils'
import { remarkWikiLink } from '@flowershow/remark-wiki-link'
import { ofmCalloutFromMarkdown } from '@moritzrs/mdast-util-ofm-callout'
import { ofmCallout } from '@moritzrs/micromark-extension-ofm-callout'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import type { ReactNodeViewUserOptions } from '@prosemirror-adapter/react'
import type { Parent } from 'mdast'
import type { Options as ToMarkdownOptions } from 'mdast-util-to-markdown'

/**
 * @prosemirror-adapter/react's node view factory for this editor. The editor
 * puts it in the Milkdown context, so a MarkdownExtension can render its own
 * nodes with React: `$view(node, (ctx) => ctx.get(nodeViewFactoryCtx.key)({ component }))`.
 */
export const nodeViewFactoryCtx = $ctx<
  ((options: ReactNodeViewUserOptions) => NodeViewConstructor) | null,
  'theoremNodeViewFactory'
>(null, 'theoremNodeViewFactory')

/**
 * Writes Markdown as Obsidian does: `-` bullets rather than remark's `*`, so
 * an edit does not rewrite every list in the note. For `editor.config`.
 */
export function obsidianMarkdownStyle(ctx: Ctx) {
  ctx.update(remarkStringifyOptionsCtx, (options) => ({
    ...options,
    bullet: '-' as const,
  }))
}

// ---- Wikilinks and embeds ---------------------------------------------------

export const remarkWikiLinks = $remark('theoremWikiLinks', () => remarkWikiLink)

/** The two inline nodes @flowershow/remark-wiki-link's mdast holds. */
type WikiNode = {
  type: 'wikiLink' | 'embed'
  value: string
  data?: { alias?: string; hProperties?: Record<string, unknown> }
}

export type WikiAttrs = {
  /** The target as written, with any `#heading` or `#^block`. */
  value: string
  /** The text after `|`: a label, or an embed's size like `300` or `300x200`. */
  alias: string | null
}

/** The alias as written; the parser moves an embed's size out of it. */
function aliasOf(node: WikiNode): string | null {
  if (node.data?.alias) return node.data.alias
  const width = node.data?.hProperties?.['data-fs-width']
  const height = node.data?.hProperties?.['data-fs-height']
  if (typeof width !== 'string') return null
  return typeof height === 'string' ? `${width}x${height}` : width
}

function wikiNode(id: 'wikiLink' | 'wikiEmbed', mdast: WikiNode['type']) {
  const attr = id === 'wikiLink' ? 'data-wikilink' : 'data-wiki-embed'
  return $node(id, () => ({
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: id === 'wikiEmbed',
    attrs: { value: { default: '' }, alias: { default: null } },
    parseDOM: [
      {
        tag: `span[${attr}]`,
        getAttrs: (dom) => ({
          value: dom.getAttribute(attr) ?? '',
          alias: dom.dataset.alias ?? null,
        }),
      },
    ],
    toDOM: (node: ProseNode) => {
      const { value, alias } = node.attrs as WikiAttrs
      return [
        'span',
        { [attr]: value, ...(alias === null ? {} : { 'data-alias': alias }) },
        `${id === 'wikiEmbed' ? '!' : ''}[[${value}${alias === null ? '' : `|${alias}`}]]`,
      ]
    },
    parseMarkdown: {
      match: (node) => node.type === mdast,
      runner: (state, node, type) => {
        const wiki = node as unknown as WikiNode
        state.addNode(type, { value: wiki.value, alias: aliasOf(wiki) })
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === id,
      runner: (state, node) => {
        const { value, alias } = node.attrs as WikiAttrs
        // The package's writer reads `data.alias`, so `data` must be there.
        state.addNode(mdast, undefined, value, {
          data: alias === null ? {} : { alias },
        })
      },
    },
  }))
}

export const wikiLinkNode = wikiNode('wikiLink', 'wikiLink')
export const wikiEmbedNode = wikiNode('wikiEmbed', 'embed')

/** Typing `[[target]]`, `[[target|label]]` or `![[target]]` makes the node. */
export const wikiInputRule = $inputRule(
  (ctx) =>
    new InputRule(
      /(!?)\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]$/,
      (state, match, start, end) => {
        const [, bang, value = '', alias] = match
        const type = (bang ? wikiEmbedNode : wikiLinkNode).type(ctx)
        return state.tr.replaceWith(
          start,
          end,
          type.create({ value: value.trim(), alias: alias?.trim() || null }),
        )
      },
    ),
)

// ---- Callouts ---------------------------------------------------------------

interface OfmCallout extends Parent {
  type: 'ofmCallout'
  kind: string
  title: string
  folded?: boolean
}

export type CalloutAttrs = {
  kind: string
  /** Null when the note writes no title, and Obsidian shows the kind. */
  title: string | null
  /** `-` folded, `+` foldable and open, null not foldable. */
  folded: boolean | null
}

/** The title Obsidian shows for a callout that names none. */
export const defaultCalloutTitle = (kind: string) =>
  kind.replace(/^\w/, (c) => c.toUpperCase())

const calloutToMarkdown: ToMarkdownOptions = {
  handlers: {
    // Adapted from @moritzrs/mdast-util-ofm-callout's ofmCalloutToMarkdown.
    ofmCallout(node: OfmCallout, _parent, state, info) {
      const fold = node.folded === true ? '-' : node.folded === false ? '+' : ''
      const title = node.title ? ` ${node.title}` : ''
      const content = state.containerFlow(node, info)
      const quoted = content
        ? `\n${state.indentLines(content, (line, _, blank) => `>${blank ? '' : ' '}${line}`)}`
        : ''
      return `> [!${node.kind}]${fold}${title}${quoted}`
    },
  },
}

const remarkCalloutPlugin: RemarkPluginRaw<undefined> = function () {
  const data = this.data() as {
    micromarkExtensions?: Array<unknown>
    fromMarkdownExtensions?: Array<unknown>
    toMarkdownExtensions?: Array<unknown>
  }
  ;(data.micromarkExtensions ??= []).push(ofmCallout())
  ;(data.fromMarkdownExtensions ??= []).push(ofmCalloutFromMarkdown())
  ;(data.toMarkdownExtensions ??= []).push(calloutToMarkdown)
}

export const remarkCallouts = $remark('theoremCallouts', () => remarkCalloutPlugin)

export const calloutNode = $node('callout', () => ({
  group: 'block',
  content: 'block+',
  defining: true,
  attrs: {
    kind: { default: 'note' },
    title: { default: null },
    folded: { default: null },
  },
  parseDOM: [
    {
      tag: 'div[data-callout]',
      contentElement: '[data-callout-content]',
      getAttrs: (dom) => {
        const folded = dom.dataset.folded
        return {
          kind: dom.dataset.callout ?? 'note',
          title: dom.dataset.title ?? null,
          folded: folded === undefined ? null : folded === 'true',
        }
      },
    },
  ],
  toDOM: (node: ProseNode) => {
    const { kind, title, folded } = node.attrs as CalloutAttrs
    return [
      'div',
      {
        'data-callout': kind,
        ...(title === null ? {} : { 'data-title': title }),
        ...(folded === null ? {} : { 'data-folded': String(folded) }),
      },
      ['div', { 'data-callout-content': '' }, 0],
    ]
  },
  parseMarkdown: {
    match: (node) => node.type === 'ofmCallout',
    runner: (state, node, type) => {
      const callout = node as unknown as OfmCallout
      // The parser fills in the default title; an equal one was not written,
      // or reads the same either way.
      const title =
        callout.title === defaultCalloutTitle(callout.kind) ? null : callout.title
      state.openNode(type, {
        kind: callout.kind,
        title,
        folded: callout.folded ?? null,
      })
      state.next(callout.children as never)
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'callout',
    runner: (state, node) => {
      const { kind, title, folded } = node.attrs as CalloutAttrs
      state.openNode('ofmCallout', undefined, {
        kind,
        title: title ?? '',
        ...(folded === null ? {} : { folded }),
      })
      state.next(node.content)
      state.closeNode()
    },
  },
}))

/** Every syntax plugin, without the React views (views.tsx adds those). */
export const markdownSyntax = [
  nodeViewFactoryCtx,
  remarkWikiLinks,
  remarkCallouts,
  wikiLinkNode,
  wikiEmbedNode,
  calloutNode,
  wikiInputRule,
].flat()
