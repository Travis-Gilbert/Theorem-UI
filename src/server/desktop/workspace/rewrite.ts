// SOURCING: micromark's parse/postprocess event stream (the same tokenizer,
// GFM, frontmatter and @flowershow/remark-wiki-link extensions markdown.ts
// uses) gives the exact source offsets of every link destination and wikilink
// target, so a rename edits only those characters; micromark-util-decode-string
// decodes destinations as mdast does. Choosing the new text, in the style the
// link was written, is hand-rolled: it is Obsidian's behaviour, not a format.
import path from 'node:path'
import { syntax as wikiLinkSyntax } from '@flowershow/remark-wiki-link'
import { parse, postprocess, preprocess } from 'micromark'
import { frontmatter } from 'micromark-extension-frontmatter'
import { gfm } from 'micromark-extension-gfm'
import { decodeString } from 'micromark-util-decode-string'
import type { Token } from 'micromark-util-types'
import type { LinkKind } from './markdown'
import { isExternal, parseDestination, parseWikiTarget } from './markdown'
import { resolveLink } from './resolve'
import type { LinkLookup } from './resolve'

// The token types @flowershow/remark-wiki-link's tokenizer emits.
declare module 'micromark-util-types' {
  interface TokenTypeMap {
    embed: 'embed'
    wikiLinkTarget: 'wikiLinkTarget'
  }
}

/** A link's target as it sits in the source text. */
export interface LinkSpan {
  syntax: 'wiki' | 'markdown'
  kind: LinkKind
  /** Offsets of the target text, without any `#heading` or `#^block` part. */
  start: number
  end: number
  /** The target text as written. */
  raw: string
  /** The target as a path, decoded. */
  target: string
  /** A Markdown destination written in `<…>`, where spaces need no escaping. */
  angle: boolean
}

const extensions = [gfm(), frontmatter(['yaml']), wikiLinkSyntax()]

const DESTINATION_STRINGS = new Set([
  'resourceDestinationString',
  'definitionDestinationString',
])
const DESTINATION_LITERALS = new Set([
  'resourceDestinationLiteral',
  'definitionDestinationLiteral',
])

/** Every link target in `text` that points into the workspace, in order. */
export function findLinkSpans(text: string): Array<LinkSpan> {
  // micromark drops a byte order mark before counting offsets.
  const bom = text.startsWith('﻿') ? 1 : 0
  const source = bom ? text.slice(1) : text
  const events = postprocess(
    parse({ extensions })
      .document()
      .write(preprocess()(source, undefined, true)),
  )
  const spans: Array<LinkSpan> = []
  const open: Array<Token['type']> = []
  let angle = false
  for (const [phase, token] of events) {
    if (phase === 'enter') open.push(token.type)
    else open.pop()
    if (DESTINATION_LITERALS.has(token.type)) angle = phase === 'enter'
    if (phase !== 'enter') continue
    const raw = source.slice(token.start.offset, token.end.offset)

    if (token.type === 'wikiLinkTarget') {
      // The editable part ends at the fragment or a table's escaped divider.
      const length = raw.search(/#|\\$/)
      const head = length === -1 ? raw : raw.slice(0, length)
      const lead = head.length - head.trimStart().length
      const target = head.trim()
      if (!target || !parseWikiTarget(raw).target) continue
      const start = bom + token.start.offset + lead
      spans.push({
        syntax: 'wiki',
        kind: open.includes('embed') ? 'embed' : 'wikilink',
        start,
        end: start + target.length,
        raw: target,
        target,
        angle: false,
      })
    } else if (DESTINATION_STRINGS.has(token.type)) {
      const hash = raw.indexOf('#')
      const head = hash === -1 ? raw : raw.slice(0, hash)
      if (!head || isExternal(decodeString(raw))) continue
      const target = parseDestination(decodeString(head)).target
      if (!target) continue
      const start = bom + token.start.offset
      spans.push({
        syntax: 'markdown',
        kind: open.includes('image') ? 'embed' : 'markdown',
        start,
        end: start + head.length,
        raw: head,
        target,
        angle,
      })
    }
  }
  return spans
}

/** Applies non-overlapping replacements to `text`. */
export function applyEdits(
  text: string,
  edits: Array<{ start: number; end: number; text: string }>,
): string {
  let result = text
  for (const edit of [...edits].sort((a, b) => b.start - a.start))
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  return result
}

/** Escapes what would end or split a Markdown destination; keeps other characters readable. */
function encodeDestination(target: string): string {
  return target.replace(/[\s()<>#?%\\]/gu, (c) =>
    c === '(' ? '%28' : c === ')' ? '%29' : encodeURIComponent(c),
  )
}

function relativeTo(fromPath: string, target: string): string {
  return path.posix.relative(path.posix.dirname(`/${fromPath}`), `/${target}`)
}

/**
 * The text that makes `span`, now in `fromPath`, point at `desired`, written
 * the way the original was: a bare name stays as short as it can while still
 * resolving to `desired`, a path stays a path, `./` stays relative, a leading
 * `/` stays absolute, and `.md` is kept or left out as it was.
 */
export function retarget(
  span: LinkSpan,
  fromPath: string,
  desired: string,
  lookup: LinkLookup,
): string {
  const keepExtension = /\.md$/i.test(span.target)
  const shown = (p: string) =>
    keepExtension || !/\.md$/i.test(p) ? p : p.slice(0, -3)

  if (span.syntax === 'markdown') {
    const written = span.raw.startsWith('/')
      ? `/${shown(desired)}`
      : shown(relativeTo(fromPath, desired))
    return span.angle ? written : encodeDestination(written)
  }

  let candidates: Array<string>
  if (/^\.\.?\//.test(span.target)) {
    const relative = relativeTo(fromPath, desired)
    candidates = [
      shown(relative.startsWith('../') ? relative : `./${relative}`),
    ]
  } else if (span.target.startsWith('/')) {
    candidates = [`/${shown(desired)}`]
  } else if (span.target.includes('/')) {
    candidates = [shown(desired)]
  } else {
    // The shortest trailing part of the path that still resolves uniquely.
    const segments = shown(desired).split('/')
    candidates = segments.map((_, i) => segments.slice(-1 - i).join('/'))
  }
  return (
    candidates.find(
      (candidate) =>
        resolveLink(candidate, fromPath, 'wiki', lookup) === desired,
    ) ?? candidates[candidates.length - 1]!
  )
}
