// SOURCING: mdast-util-from-markdown with micromark-extension-gfm and
// mdast-util-gfm (tables, task lists), micromark-extension-frontmatter and
// mdast-util-frontmatter, and @flowershow/remark-wiki-link's micromark syntax
// and mdast extension (wikilinks and ![[embeds]]); yaml parses frontmatter;
// unist-util-visit and mdast-util-to-string walk the tree. Hand-rolled, on
// text nodes the parser has already separated from code: Obsidian's inline
// #tags (the only micromark tag extension, @moritzrs/micromark-extension-ofm-tag
// 0.0.1, rejects the non-ASCII letters Obsidian allows) and ^block ids, which
// no Markdown library models.
import {
  fromMarkdown as wikiLinkFromMarkdown,
  syntax as wikiLinkSyntax,
} from '@flowershow/remark-wiki-link'
import type { Literal, Nodes, Root } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { toString } from 'mdast-util-to-string'
import { frontmatter } from 'micromark-extension-frontmatter'
import { gfm } from 'micromark-extension-gfm'
import { visit } from 'unist-util-visit'
import { parse as parseYaml } from 'yaml'
import type { WorkspaceLink } from '#/lib/workspace/types'

// The nodes @flowershow/remark-wiki-link's mdast extension creates. `value`
// is the target as written, with any `#heading` or `#^block` part.
interface WikiLinkNode extends Literal {
  type: 'wikiLink' | 'embed'
}
declare module 'mdast' {
  interface PhrasingContentMap {
    wikiLink: WikiLinkNode
  }
  interface RootContentMap {
    wikiLink: WikiLinkNode
  }
}

export type LinkKind = WorkspaceLink['kind']

export interface ParsedLink {
  kind: LinkKind
  /** Wiki syntax (`[[…]]`) or a Markdown destination (`[x](…)`, `![x](…)`, definitions). */
  syntax: 'wiki' | 'markdown'
  /** The target without heading or block part, decoded. */
  target: string
  heading?: string
  block?: string
  line: number
}

export interface ParsedNote {
  /** Parsed frontmatter, or an empty object when there is none or it is not a map. */
  properties: Record<string, unknown>
  links: Array<ParsedLink>
  headings: Array<{ depth: number; text: string; line: number }>
  tags: Array<{ tag: string; source: 'inline' | 'frontmatter'; line: number }>
  tasks: Array<{ text: string; checked: boolean; line: number }>
  blocks: Array<{ id: string; line: number }>
  /** The Markdown after the frontmatter, for full-text search. */
  body: string
}

const syntaxExtensions = [gfm(), frontmatter(['yaml']), wikiLinkSyntax()]
const mdastExtensions = [
  gfmFromMarkdown(),
  frontmatterFromMarkdown(['yaml']),
  wikiLinkFromMarkdown(),
]

/** Parses Markdown into an mdast tree with GFM, frontmatter and wikilinks. */
export function parseTree(text: string): Root {
  return fromMarkdown(text, {
    extensions: syntaxExtensions,
    mdastExtensions,
  })
}

/** A destination with a URI scheme or a protocol-relative URL leaves the workspace. */
export function isExternal(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Splits `target#heading` or `target#^block` into its parts. */
export function splitFragment(raw: string): {
  target: string
  heading?: string
  block?: string
} {
  const hash = raw.indexOf('#')
  if (hash === -1) return { target: raw.trim() }
  const target = raw.slice(0, hash).trim()
  const fragment = raw.slice(hash + 1).trim()
  if (!fragment) return { target }
  return fragment.startsWith('^')
    ? { target, block: fragment.slice(1) }
    : { target, heading: fragment }
}

/** The target, heading and block of a Markdown destination as written. */
export function parseDestination(raw: string) {
  const parts = splitFragment(raw)
  return {
    target: safeDecode(parts.target),
    heading: parts.heading && safeDecode(parts.heading),
    block: parts.block && safeDecode(parts.block),
  }
}

/** The target, heading and block of a wikilink's target text (before `|`). */
export function parseWikiTarget(raw: string) {
  // In a table, Obsidian escapes the alias divider as `\|`.
  return splitFragment(raw.replace(/\\$/, ''))
}

// Obsidian tags: letters, digits, _, - and /, with at least one non-digit,
// starting at a word boundary.
const INLINE_TAG = /(?<![^\s([{,;])#([\p{L}\p{M}\p{N}_/-]+)/gu
const BLOCK_ID = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/

function frontmatterTags(value: unknown): Array<string> {
  const list =
    typeof value === 'string'
      ? value.split(/[,\s]+/)
      : Array.isArray(value)
        ? value.filter((tag): tag is string => typeof tag === 'string')
        : []
  return list.map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean)
}

const lineOf = (node: Nodes) => node.position?.start.line ?? 1

/** Everything the index keeps about a Markdown file. */
export function parseNote(text: string): ParsedNote {
  const tree = parseTree(text)
  const note: ParsedNote = {
    properties: {},
    links: [],
    headings: [],
    tags: [],
    tasks: [],
    blocks: [],
    body: text,
  }

  visit(tree, (node) => {
    switch (node.type) {
      case 'yaml': {
        note.body = text.slice(node.position?.end.offset ?? 0)
        try {
          const data: unknown = parseYaml(node.value)
          if (data && typeof data === 'object' && !Array.isArray(data))
            note.properties = data as Record<string, unknown>
        } catch {
          // Invalid frontmatter leaves the note without properties.
        }
        const line = lineOf(node)
        for (const key of ['tags', 'tag'])
          for (const tag of frontmatterTags(note.properties[key]))
            note.tags.push({ tag, source: 'frontmatter', line })
        break
      }
      case 'wikiLink':
      case 'embed': {
        const parts = parseWikiTarget(node.value)
        if (!parts.target) break
        note.links.push({
          kind: node.type === 'embed' ? 'embed' : 'wikilink',
          syntax: 'wiki',
          ...parts,
          line: lineOf(node),
        })
        break
      }
      case 'link':
      case 'image':
      case 'definition': {
        if (!node.url || isExternal(node.url)) break
        const parts = parseDestination(node.url)
        if (!parts.target) break
        note.links.push({
          kind: node.type === 'image' ? 'embed' : 'markdown',
          syntax: 'markdown',
          ...parts,
          line: lineOf(node),
        })
        break
      }
      case 'heading':
        note.headings.push({
          depth: node.depth,
          text: toString(node).trim(),
          line: lineOf(node),
        })
        break
      case 'listItem':
        if (typeof node.checked === 'boolean')
          note.tasks.push({
            text: toString(node.children[0] ?? node).trim(),
            checked: node.checked,
            line: lineOf(node),
          })
        break
      case 'paragraph': {
        const id = BLOCK_ID.exec(toString(node))?.[1]
        if (id) note.blocks.push({ id, line: lineOf(node) })
        break
      }
      case 'text':
        for (const match of node.value.matchAll(INLINE_TAG)) {
          const tag = match[1]!.replace(/\/+$/, '')
          if (tag && !/^[\d/]+$/.test(tag))
            note.tags.push({ tag, source: 'inline', line: lineOf(node) })
        }
        break
    }
  })
  return note
}
