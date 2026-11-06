// SOURCING: @tanstack/highlight's createHighlighter/tokenize for class-based code tokens, with the languages a coding agent writes; mdast-util-from-markdown for where fenced code sits in the agent's markdown; colours are the terminal crate's (terminal/src/lib.rs)
//
// Code the agent writes, highlighted for the terminal. The terminal draws
// markdown itself (tui-markdown, highlighting off); fenced code is lifted out
// here and handed over as lines of classed tokens, which the crate colours in
// its own slate.
import { createHighlighter } from '@tanstack/highlight/core'
import { c } from '@tanstack/highlight/languages/c'
import { cpp } from '@tanstack/highlight/languages/cpp'
import { csharp } from '@tanstack/highlight/languages/csharp'
import { css } from '@tanstack/highlight/languages/css'
import { diff } from '@tanstack/highlight/languages/diff'
import { dockerfile } from '@tanstack/highlight/languages/dockerfile'
import { go } from '@tanstack/highlight/languages/go'
import { graphql } from '@tanstack/highlight/languages/graphql'
import { html } from '@tanstack/highlight/languages/html'
import { ini } from '@tanstack/highlight/languages/ini'
import { java } from '@tanstack/highlight/languages/java'
import { js } from '@tanstack/highlight/languages/js'
import { json } from '@tanstack/highlight/languages/json'
import { jsx } from '@tanstack/highlight/languages/jsx'
import { kotlin } from '@tanstack/highlight/languages/kotlin'
import { makefile } from '@tanstack/highlight/languages/makefile'
import { markdown } from '@tanstack/highlight/languages/markdown'
import { python } from '@tanstack/highlight/languages/python'
import { ruby } from '@tanstack/highlight/languages/ruby'
import { rust } from '@tanstack/highlight/languages/rust'
import { scss } from '@tanstack/highlight/languages/scss'
import { shell } from '@tanstack/highlight/languages/shell'
import { sql } from '@tanstack/highlight/languages/sql'
import { swift } from '@tanstack/highlight/languages/swift'
import { toml } from '@tanstack/highlight/languages/toml'
import { ts } from '@tanstack/highlight/languages/ts'
import { tsx } from '@tanstack/highlight/languages/tsx'
import { yaml } from '@tanstack/highlight/languages/yaml'
import { fromMarkdown } from 'mdast-util-from-markdown'

const highlighter = createHighlighter({
  languages: [
    c,
    cpp,
    csharp,
    css,
    diff,
    dockerfile,
    go,
    graphql,
    html,
    ini,
    java,
    js,
    json,
    jsx,
    kotlin,
    makefile,
    markdown,
    python,
    ruby,
    rust,
    scss,
    shell,
    sql,
    swift,
    toml,
    ts,
    tsx,
    yaml,
  ],
})

/** One run of code text; `c` is its highlight class, absent for plain text. */
export type Token = { t: string; c?: string }

export type CodePart = {
  type: 'code'
  /** The fence's language as written; empty for none. */
  lang: string
  lines: Token[][]
}

export type ProsePart = { type: 'text'; text: string }

/** Code as lines of classed tokens; an unknown language comes back plain. */
export function highlightLines(code: string, lang = ''): Token[][] {
  const { tokens } = highlighter.tokenize(code, { lang })
  const lines: Token[][] = [[]]
  for (const token of tokens) {
    token.value.split('\n').forEach((piece, index) => {
      if (index > 0) lines.push([])
      if (!piece) return
      lines[lines.length - 1]?.push(
        token.className ? { t: piece, c: token.className } : { t: piece },
      )
    })
  }
  return lines
}

/** Lines of output a tool row carries for ctrl+o; the rest is counted. */
export const OUTPUT_LINES = 40

export type Output = { lang: string; lines: Token[][]; more: number }

const DIFF = /^(diff --git |@@ -\d|--- \S|\+\+\+ \S)/m

/** The language a file path's extension names, if one is registered. */
function languageOf(path: string | undefined) {
  const ext = path?.match(/\.([\w-]+)$/)?.[1]
  const lang = highlighter.normalizeLanguage(ext ?? '')
  return lang === 'plaintext' ? '' : lang
}

/**
 * A tool's result as the terminal shows it under its row: text as returned,
 * a unified diff as a diff, file content in its path's language, structured
 * results as JSON. Long output keeps its first lines and counts the rest.
 */
export function toolOutput(
  result: unknown,
  path: string | undefined,
): Output | undefined {
  if (result === undefined || result === null || result === '') return
  const content =
    typeof result === 'object' && 'content' in result
      ? result.content
      : undefined
  const texts = Array.isArray(content)
    ? content.flatMap((item: unknown) =>
        item &&
        typeof item === 'object' &&
        'text' in item &&
        typeof item.text === 'string'
          ? [item.text]
          : [],
      )
    : []
  const text =
    typeof result === 'string'
      ? result
      : texts.length
        ? texts.join('\n')
        : JSON.stringify(result, null, 2)
  const lang =
    typeof result !== 'string' && !texts.length
      ? 'json'
      : DIFF.test(text)
        ? 'diff'
        : languageOf(path)
  const rows = text.replace(/\n$/, '').split('\n')
  return {
    lang,
    lines: highlightLines(rows.slice(0, OUTPUT_LINES).join('\n'), lang),
    more: Math.max(0, rows.length - OUTPUT_LINES),
  }
}

/**
 * The agent's markdown with its top-level code blocks lifted out and
 * highlighted, in order. Code nested in a list or quote stays in the prose
 * and draws in the terminal's plain code style. A fence still streaming has
 * no closing line yet and runs to the end, as markdown reads it.
 */
export function proseAndCode(text: string): (ProsePart | CodePart)[] {
  if (!text.includes('```') && !text.includes('~~~') && !/^ {4}/m.test(text))
    return [{ type: 'text', text }]
  const parts: (ProsePart | CodePart)[] = []
  let from = 0
  const prose = (to: number) => {
    const slice = text.slice(from, to)
    if (slice.trim()) parts.push({ type: 'text', text: slice })
  }
  for (const node of fromMarkdown(text).children) {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (node.type !== 'code' || start === undefined || end === undefined)
      continue
    prose(start)
    parts.push({
      type: 'code',
      lang: node.lang ?? '',
      lines: highlightLines(node.value, node.lang ?? ''),
    })
    from = end
  }
  prose(text.length)
  return parts
}
