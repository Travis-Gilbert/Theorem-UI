// SOURCING: md-attr-parser (the `{.live #id key=value}` attribute block, the
// syntax remark-attr and Pandoc use), unist-util-visit (walking the tree),
// mdast-util-from-markdown with the GFM and frontmatter extensions (the same
// parse the workspace index uses) and the positions micromark records: each
// fence is sliced from the source, so it round-trips byte for byte. The
// pinned-output markers follow plan D11's `<!-- theorem:run -->` markers.
import parseAttr from 'md-attr-parser'
import type { Code, Parents, Root, RootContent } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { frontmatter } from 'micromark-extension-frontmatter'
import { gfm } from 'micromark-extension-gfm'
import type { Position } from 'unist'
import { SKIP, visit } from 'unist-util-visit'

/** The mdast node type `.live` fences become before Milkdown sees them. */
export const LIVE_BLOCK_MDAST_TYPE = 'theoremLiveBlock'

/** What a live fence runs: code, a query over structured data, or an agent. */
export type LiveKind = 'code' | 'query' | 'agent'

/** A `.live` fence, what separates it from its pinned output, and that output, as written. */
export interface LiveBlockSource {
  /** The fence from its opening line to its closing line. */
  fence: string
  /** Whitespace between the fence and the pinned output, usually a blank line. */
  gap: string
  /** The pinned output from its opening marker to its closing marker, or null. */
  output: string | null
}

export interface LiveBlockMdast extends LiveBlockSource {
  type: typeof LIVE_BLOCK_MDAST_TYPE
  position?: Position
}

/** The parsed info string of a `.live` fence. */
export interface FenceInfo {
  /** The language word, lowercased: `tsx`, `query`, `agent`. */
  lang: string
  /** Null when `.live` is set on a language nothing runs. */
  kind: LiveKind | null
  /** The block's name, from `#id`; other blocks refer to it by this name. */
  id: string | null
  classes: Array<string>
  /** Other `key=value` attributes. */
  attributes: Record<string, string>
}

/** Languages a `.live` code fence may be written in. */
export const CODE_LANGUAGES = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'typescript',
  'javascript',
])

function kindOf(lang: string): LiveKind | null {
  if (CODE_LANGUAGES.has(lang)) return 'code'
  if (lang === 'query' || lang === 'agent') return lang
  return null
}

/** Parses a fence's info string; null unless it carries the `.live` class. */
export function parseFenceInfo(info: string): FenceInfo | null {
  const brace = info.indexOf('{')
  if (brace === -1) return null
  const { prop } = parseAttr(info, brace)
  const { id, class: classes = [], ...rest } = prop
  if (!classes.includes('live')) return null
  const lang = info.slice(0, brace).trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const attributes: Record<string, string> = {}
  for (const [key, value] of Object.entries(rest))
    if (typeof value === 'string') attributes[key] = value
  return { lang, kind: kindOf(lang), id: id || null, classes, attributes }
}

// Fences ------------------------------------------------------------------

const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/

/** A fence taken apart, every line as written. */
export interface FenceParts {
  open: string
  /** Spaces before the opening fence (0 to 3); content lines carry up to as many. */
  indent: number
  /** The fence characters, such as ``` or ~~~~. */
  marker: string
  info: string
  lines: Array<string>
  /** The closing line, or null when the fence runs to the end of its container. */
  close: string | null
}

function closes(line: string, marker: string): boolean {
  const run = FENCE_CLOSE.exec(line)?.[1]
  return !!run && run[0] === marker[0] && run.length >= marker.length
}

export function splitFence(fence: string): FenceParts {
  const [open = '', ...rest] = fence.split('\n')
  const match = FENCE_OPEN.exec(open)
  const marker = match?.[2] ?? '```'
  const last = rest.at(-1)
  const closed = last !== undefined && closes(last, marker)
  return {
    open,
    indent: match?.[1]?.length ?? 0,
    marker,
    info: match?.[3] ?? '',
    lines: closed ? rest.slice(0, -1) : rest,
    close: closed ? last : null,
  }
}

/** The fence's info string, parsed; null when it is not a live fence. */
export function fenceInfo(fence: string): FenceInfo | null {
  return parseFenceInfo(splitFence(fence).info)
}

/** The code inside the fence, without the indentation the fence adds. */
export function fenceCode(fence: string): string {
  const { indent, lines } = splitFence(fence)
  const strip = new RegExp(`^ {0,${indent}}`)
  return lines.map((line) => line.replace(strip, '')).join('\n')
}

/** The fence with its closing line, adding one when the fence has none. */
export function closedFence(fence: string): string {
  const { close, indent, marker } = splitFence(fence)
  return close === null ? `${fence}\n${' '.repeat(indent)}${marker}` : fence
}

/**
 * The fence with new code. The opening and closing lines stay as written;
 * the fence is lengthened when the code holds a line that would close it.
 */
export function withFenceCode(fence: string, code: string): string {
  if (code === fenceCode(fence)) return fence
  const parts = splitFence(fence)
  const pad = ' '.repeat(parts.indent)
  const lines = code === '' ? [] : code.split('\n')
  let { open, marker } = parts
  let close = parts.close ?? `${pad}${marker}`
  if (lines.some((line) => closes(line, marker))) {
    const longest = Math.max(
      ...lines.map((line) => FENCE_CLOSE.exec(line)?.[1]?.length ?? 0),
    )
    const longer = marker[0]!.repeat(longest + 1)
    open = open.replace(marker, longer)
    close = close.replace(marker, longer)
    marker = longer
  }
  return [open, ...lines.map((line) => line && pad + line), close].join('\n')
}

/** The fence with `#id` added to its attribute block. */
export function withFenceId(fence: string, id: string): string {
  const parts = splitFence(fence)
  const brace = parts.info.indexOf('{')
  if (brace === -1) return fence
  const end = brace + parseAttr(parts.info, brace).eaten.length - 1
  const at = parts.indent + parts.marker.length + end
  return `${parts.open.slice(0, at)} #${id}${parts.open.slice(at)}${fence.slice(parts.open.length)}`
}

// Pinned output -------------------------------------------------------------

const OUTPUT_OPEN = /^<!--\s*theorem:output\s+#([\w:.-]+)\s*-->$/
const OUTPUT_CLOSE = /^<!--\s*\/theorem:output\s*-->$/

/** A pinned output block for `id` holding `markdown`. */
export function pinnedOutput(id: string, markdown: string): string {
  return `<!-- theorem:output #${id} -->\n\n${markdown.trim()}\n\n<!-- /theorem:output -->`
}

/** The Markdown between a pinned output's markers. */
export function pinnedBody(output: string): string {
  const lines = output.split('\n')
  return lines.slice(1, -1).join('\n').trim()
}

/** The live block as Markdown: the fence, then the gap and output when pinned. */
export function serializeLiveBlock({
  fence,
  gap,
  output,
}: LiveBlockSource): string {
  const closed = closedFence(fence)
  if (output === null) return closed
  return closed + (/^\n[ \t\n]*$/.test(gap) ? gap : '\n\n') + output
}

// The transformer -------------------------------------------------------------

// List markers on a container's first line become spaces on the lines after it.
const LIST_MARKER = /(^|[\s>])([-+*]|\d{1,9}[.)])(?=[ \t]|$)/g

/** What every line after the first carries in front, inside a list or quote. */
function containerPrefix(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1
  return source
    .slice(lineStart, offset)
    .replace(
      LIST_MARKER,
      (_match, lead: string, marker: string) => lead + ' '.repeat(marker.length),
    )
}

/** Removes the container prefix from every line after the first; null if a line lacks it. */
function stripContainer(text: string, prefix: string): string | null {
  if (!prefix) return text
  const [first = '', ...rest] = text.split('\n')
  const out = [first]
  for (const line of rest) {
    if (line.startsWith(prefix)) out.push(line.slice(prefix.length))
    else if (line.trim() === '' || line.trimEnd() === prefix.trimEnd())
      out.push('')
    else return null
  }
  return out.join('\n')
}

function fenceFromValue(code: Code): string {
  const info = [code.lang, code.meta].filter(Boolean).join(' ')
  return code.value === ''
    ? `\`\`\`${info}\n\`\`\``
    : `\`\`\`${info}\n${code.value}\n\`\`\``
}

const offsets = (node: { position?: Position }) => ({
  start: node.position?.start.offset,
  end: node.position?.end.offset,
})

interface Slicer {
  source: string
  prefix: string
  topLevel: boolean
}

function rawFence(code: Code, slicer: Slicer | null): string {
  const { start, end } = offsets(code)
  if (!slicer || start === undefined || end === undefined)
    return fenceFromValue(code)
  const { source, prefix, topLevel } = slicer
  if (topLevel) {
    // The slice keeps the fence's own indentation of up to three spaces.
    const lineStart = source.lastIndexOf('\n', start - 1) + 1
    return source.slice(lineStart, end)
  }
  return stripContainer(source.slice(start, end), prefix) ?? fenceFromValue(code)
}

interface Absorbed {
  consumed: number
  gap: string
  output: string
  end: Position['end']
}

/** The pinned output right after the fence at `index`, if it names this block. */
function absorbOutput(
  parent: Parents,
  index: number,
  id: string,
  slicer: Slicer,
): Absorbed | null {
  const children = parent.children as Array<RootContent>
  const open = children[index + 1]
  if (open?.type !== 'html' || OUTPUT_OPEN.exec(open.value.trim())?.[1] !== id)
    return null
  const closeIndex = children.findIndex(
    (child, i) =>
      i > index + 1 &&
      child.type === 'html' &&
      OUTPUT_CLOSE.test(child.value.trim()),
  )
  const close = children[closeIndex]
  const codeEnd = offsets(children[index]!).end
  const openStart = offsets(open).start
  const closeEnd = offsets(close ?? {}).end
  if (
    !close?.position ||
    codeEnd === undefined ||
    openStart === undefined ||
    closeEnd === undefined
  )
    return null
  const { source, prefix } = slicer
  const gap = stripContainer(source.slice(codeEnd, openStart), prefix)
  const output = stripContainer(source.slice(openStart, closeEnd), prefix)
  if (gap === null || output === null || !/^\n[ \t\n]*$/.test(gap)) return null
  return {
    consumed: closeIndex - index + 1,
    gap,
    output,
    end: close.position.end,
  }
}

/**
 * Turns every `.live` fence in the tree into a `theoremLiveBlock` node that
 * holds the fence as written, absorbing the pinned output right after it.
 * Other fences are left alone. `source` is the Markdown the tree was parsed
 * from; without it fences are rebuilt from their parsed value.
 */
export function transformLiveBlocks(tree: Root, source?: string): void {
  visit(tree, 'code', (code, index, parent) => {
    if (!parent || index === undefined) return
    const { start } = offsets(code)
    const slicer: Slicer | null =
      source === undefined || start === undefined
        ? null
        : {
            source,
            topLevel: parent.type === 'root',
            prefix:
              parent.type === 'root' ? '' : containerPrefix(source, start),
          }
    const fence = rawFence(code, slicer)
    const info = fenceInfo(fence)
    if (!info) return
    const absorbed =
      info.id && slicer ? absorbOutput(parent, index, info.id, slicer) : null
    const node: LiveBlockMdast = {
      type: LIVE_BLOCK_MDAST_TYPE,
      fence,
      gap: absorbed?.gap ?? '\n\n',
      output: absorbed?.output ?? null,
      position: code.position && {
        start: code.position.start,
        end: absorbed?.end ?? code.position.end,
      },
    }
    ;(parent.children as Array<unknown>).splice(
      index,
      absorbed?.consumed ?? 1,
      node,
    )
    return [SKIP, index + 1]
  })
}

/** A remark plugin running `transformLiveBlocks` over the file being parsed. */
export function remarkLiveBlocks() {
  return (tree: Root, file: { value?: unknown }) => {
    transformLiveBlocks(
      tree,
      typeof file.value === 'string' ? file.value : undefined,
    )
  }
}

/** A live block found in a Markdown document. */
export interface LiveBlockInDocument extends LiveBlockSource {
  info: FenceInfo
  code: string
  position: Position | undefined
}

/** Parses Markdown the way the workspace index does. */
export function parseMarkdown(markdown: string): Root {
  return fromMarkdown(markdown, {
    extensions: [gfm(), frontmatter(['yaml'])],
    mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown(['yaml'])],
  })
}

/** Every live block in a Markdown document, in order. */
export function liveBlocksIn(markdown: string): Array<LiveBlockInDocument> {
  const tree = parseMarkdown(markdown)
  transformLiveBlocks(tree, markdown)
  const found: Array<LiveBlockInDocument> = []
  visit(tree, (node) => {
    if ((node.type as string) !== LIVE_BLOCK_MDAST_TYPE) return
    const block = node as unknown as LiveBlockMdast
    const info = fenceInfo(block.fence)
    if (info)
      found.push({
        fence: block.fence,
        gap: block.gap,
        output: block.output,
        info,
        code: fenceCode(block.fence),
        position: block.position,
      })
  })
  return found
}
