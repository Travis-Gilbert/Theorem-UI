// SOURCING: the block parser in format.ts (mdast with GFM, frontmatter and
// @flowershow/remark-wiki-link, with source positions), yaml (field values
// read as YAML scalars, as frontmatter is) and the QuickJS formula engine
// (formulas/). The mention syntax follows Dataview's inline fields
// (`[key:: value]`, `key:: value`), the closest thing to a convention
// Markdown has; no library parses it outside Dataview itself, so the scanner
// below is this app's. The model (mentions, per-day formulas that chain,
// properties inherited down the outline) is Embark's; docs/blocks/embark.md
// describes the syntax.
import type { Heading, List, Paragraph, Root, RootContent } from 'mdast'
import { visit } from 'unist-util-visit'
import { parse as parseYaml } from 'yaml'
import { parseMarkdown } from './format'
import type { FormulaEngine } from './formulas/engine'
import type { ChainFormula } from './formulas/runner'

/** One outline node that mentions structured data. */
export interface EmbarkRecord {
  /** The node, unique in the document. */
  id: number
  /** 1-based line of the node's text. */
  line: number
  /** The node's text without its fields and date. */
  text: string
  /** Its own `@YYYY-MM-DD`, or the nearest one above it. */
  date: string | null
  /** Wikilink targets it mentions. */
  links: Array<string>
  /** Its fields, with those of every node above it under them. */
  values: Record<string, unknown>
  /** Formulas that apply to it, from nodes above it or its own. */
  formulas: Record<string, ChainFormula>
  /** Every outline node above it, nearest last; headings among them. */
  ancestors: Array<number>
  /** The nearest record above it: it is a detail of that record. */
  parent: number | null
  /** The nearest heading's text. */
  heading: string | null
}

/** A heading, for finding the subtree a query collects from. */
export interface EmbarkSection {
  id: number
  depth: number
  text: string
  /** 1-based lines it spans, heading included. */
  start: number
  end: number
}

export interface EmbarkDocument {
  records: Array<EmbarkRecord>
  sections: Array<EmbarkSection>
  /** Problems with fields, by line. */
  errors: Array<{ line: number; message: string }>
}

interface Mentions {
  fields: Record<string, unknown>
  formulas: Record<string, string>
  date: string | null
  links: Array<string>
  text: string
  found: boolean
}

const KEY = /^[\p{L}\p{N}_][\p{L}\p{N}_ -]*$/u
const DATE = /(^|[\s([{])@(\d{4}-\d{2}-\d{2})(?![\w-])/gu
const LINE_FIELD = /^([\p{L}\p{N}_][\p{L}\p{N}_ -]*?)::\s*(.*)$/u

/** A field's value: `= expression` is a formula, anything else a YAML scalar. */
function fieldValue(raw: string): { formula: string } | { value: unknown } {
  const text = raw.trim()
  if (text.startsWith('=')) return { formula: text.slice(1).trim() }
  // A wikilink as a value stays the text it is, not a YAML list.
  if (/^\[\[.*\]\]$/.test(text)) return { value: text }
  try {
    return { value: (parseYaml(text) as unknown) ?? null }
  } catch {
    return { value: text }
  }
}

/**
 * Finds `[key:: value]` and `(key:: value)` in `text`, brackets balanced so a
 * value may hold a `[[link]]`. Returns them and the text with them removed.
 */
function scanBracketFields(text: string) {
  const found: Array<{ key: string; raw: string }> = []
  let rest = ''
  let at = 0
  while (at < text.length) {
    const open = text[at]
    const close = open === '[' ? ']' : open === '(' ? ')' : null
    const separator = close ? text.indexOf('::', at) : -1
    const key = separator > at ? text.slice(at + 1, separator).trim() : ''
    if (!close || !KEY.test(key) || text[at + 1] === '[') {
      rest += text[at]
      at++
      continue
    }
    let depth = 0
    let end = -1
    for (let i = at; i < text.length; i++) {
      if (text[i] === open) depth++
      else if (text[i] === close && --depth === 0) {
        end = i
        break
      }
    }
    if (end === -1) {
      rest += text[at]
      at++
      continue
    }
    found.push({ key, raw: text.slice(separator + 2, end) })
    at = end + 1
  }
  return { found, rest }
}

/** The mentions in one node's own text. */
function mentionsIn(source: string, links: Array<string>): Mentions {
  const mentions: Mentions = {
    fields: {},
    formulas: {},
    date: null,
    links,
    text: '',
    found: links.length > 0,
  }
  const add = (key: string, raw: string) => {
    const value = fieldValue(raw)
    if ('formula' in value) mentions.formulas[key] = value.formula
    else mentions.fields[key] = value.value
    mentions.found = true
  }
  const kept: Array<string> = []
  for (const line of source.split('\n')) {
    const whole = LINE_FIELD.exec(line.trim())
    if (whole && !line.trim().startsWith('[')) {
      add(whole[1]!.trim(), whole[2]!)
      continue
    }
    const { found, rest } = scanBracketFields(line)
    for (const { key, raw } of found) add(key, raw)
    kept.push(rest)
  }
  let text = kept.join('\n')
  text = text.replace(DATE, (_match, before: string, date: string) => {
    mentions.date ??= date
    mentions.found = true
    return before
  })
  mentions.text = text.replace(/\s+/g, ' ').trim()
  return mentions
}

interface Outline {
  id: number
  line: number
  mentions: Mentions
  /** A heading's depth, or null for a list item or paragraph. */
  depth: number | null
  parent: Outline | null
  children: Array<Outline>
}

/** Parses a document's mentions, sections and inherited fields. */
export function parseEmbark(markdown: string): EmbarkDocument {
  const tree: Root = parseMarkdown(markdown)
  const errors: EmbarkDocument['errors'] = []
  let nextId = 1
  const root: Outline = {
    id: 0,
    line: 1,
    depth: 0,
    parent: null,
    children: [],
    mentions: {
      fields: {},
      formulas: {},
      date: null,
      links: [],
      text: '',
      found: false,
    },
  }
  const sections: Array<EmbarkSection> = []

  // Frontmatter fields hold for the whole document, as the root's own.
  const yaml = tree.children.find((node) => node.type === 'yaml')
  if (yaml) {
    try {
      const properties = parseYaml(yaml.value) as unknown
      if (properties && typeof properties === 'object')
        for (const [key, value] of Object.entries(properties))
          if (typeof value === 'string' && value.trim().startsWith('='))
            root.mentions.formulas[key] = value.trim().slice(1).trim()
          else root.mentions.fields[key] = value
    } catch (error) {
      errors.push({ line: 1, message: (error as Error).message })
    }
  }

  // The node's own text, with inline code blanked so `[x:: 1]` in code is not a field.
  const ownText = (node: Paragraph | Heading) => {
    const start = node.position?.start.offset ?? 0
    const end = node.position?.end.offset ?? start
    let text = markdown.slice(start, end)
    visit(node, 'inlineCode', (code) => {
      const from = (code.position?.start.offset ?? start) - start
      const to = (code.position?.end.offset ?? start) - start
      text = text.slice(0, from) + ' '.repeat(to - from) + text.slice(to)
    })
    if (node.type === 'heading') text = text.replace(/^#{1,6}\s*/, '')
    return text
  }
  const linksIn = (node: Paragraph | Heading) => {
    const links: Array<string> = []
    visit(node, (child) => {
      if ((child.type as string) === 'wikiLink')
        links.push((child as unknown as { value: string }).value)
    })
    return links
  }
  const outline = (
    node: Paragraph | Heading,
    parent: Outline,
    depth: number | null,
  ): Outline => {
    const item: Outline = {
      id: nextId++,
      line: node.position?.start.line ?? 1,
      depth,
      parent,
      children: [],
      mentions: mentionsIn(ownText(node), linksIn(node)),
    }
    parent.children.push(item)
    return item
  }

  const walkList = (list: List, parent: Outline) => {
    for (const item of list.children) {
      const [first, ...rest] = item.children
      const self =
        first?.type === 'paragraph' ? outline(first, parent, null) : parent
      walkBlocks(first?.type === 'paragraph' ? rest : item.children, self)
    }
  }
  const walkBlocks = (nodes: Array<RootContent>, parent: Outline) => {
    for (const node of nodes) {
      if (node.type === 'paragraph') outline(node, parent, null)
      else if (node.type === 'list') walkList(node, parent)
      else if (node.type === 'blockquote') walkBlocks(node.children, parent)
    }
  }

  // Headings nest by depth; everything after a heading sits under it.
  const stack: Array<Outline> = [root]
  for (const node of tree.children) {
    if (node.type === 'heading') {
      while ((stack.at(-1)!.depth ?? 0) >= node.depth) stack.pop()
      const heading = outline(node, stack.at(-1)!, node.depth)
      stack.push(heading)
      sections.push({
        id: heading.id,
        depth: node.depth,
        text: heading.mentions.text,
        start: heading.line,
        end: markdown.split('\n').length,
      })
      continue
    }
    walkBlocks([node], stack.at(-1)!)
  }
  // A section ends where the next heading of its depth or shallower starts.
  for (const [i, section] of sections.entries()) {
    const next = sections
      .slice(i + 1)
      .find((other) => other.depth <= section.depth)
    if (next) section.end = next.start - 1
  }

  const records: Array<EmbarkRecord> = []
  const visitOutline = (
    node: Outline,
    inherited: {
      values: Record<string, unknown>
      formulas: Record<string, ChainFormula>
      date: string | null
      ancestors: Array<number>
      heading: string | null
      parent: number | null
    },
  ) => {
    const own = node.mentions
    const values = { ...inherited.values, ...own.fields }
    const date = own.date ?? inherited.date
    const ownFormulas = Object.fromEntries(
      Object.entries(own.formulas).map(([key, expression]) => [
        key,
        { expression, scope: node.id },
      ]),
    )
    // A formula applies to the records below the node it is written on; on a
    // node with no records below it, to that node.
    const hasRecordsBelow = (n: Outline): boolean =>
      n.children.some(
        (child) =>
          (child.depth === null && child.mentions.found) ||
          hasRecordsBelow(child),
      )
    const below = hasRecordsBelow(node)
    const isRecord = node.depth === null && own.found
    if (isRecord)
      records.push({
        id: node.id,
        line: node.line,
        text: own.text,
        date,
        links: own.links,
        values,
        formulas: below
          ? inherited.formulas
          : { ...inherited.formulas, ...ownFormulas },
        ancestors: inherited.ancestors,
        heading: inherited.heading,
        parent: inherited.parent,
      })
    // The records under a record are its details: they take its computed
    // values rather than taking a turn in its formulas' chain.
    const next = {
      values,
      formulas: isRecord
        ? ownFormulas
        : { ...inherited.formulas, ...ownFormulas },
      date,
      ancestors: [...inherited.ancestors, node.id],
      heading: node.depth ? own.text : inherited.heading,
      parent: isRecord ? node.id : inherited.parent,
    }
    for (const child of node.children) visitOutline(child, next)
  }
  visitOutline(root, {
    values: {},
    formulas: {},
    date: null,
    ancestors: [],
    heading: null,
    parent: null,
  })
  return { records, sections, errors }
}

/** The records a query at `line` collects: those in its section, or in the heading named. */
export function recordsUnder(
  document: EmbarkDocument,
  where: { line: number } | { heading: string },
): Array<EmbarkRecord> {
  const section =
    'heading' in where
      ? document.sections.find(
          (s) => s.text.toLowerCase() === where.heading.trim().toLowerCase(),
        )
      : document.sections
          .filter((s) => s.start <= where.line && where.line <= s.end)
          .at(-1)
  if ('heading' in where && !section)
    throw new Error(`No heading "${where.heading}" in this document`)
  return section
    ? document.records.filter((record) => record.ancestors.includes(section.id))
    : document.records
}

/** Each record with its formulas computed, chained day by day in QuickJS. */
export async function computeEmbark(
  records: Array<EmbarkRecord>,
  engine: FormulaEngine,
  today: string,
): Promise<{
  records: Array<EmbarkRecord>
  errors: Array<{ line: number; message: string }>
}> {
  if (!records.some((record) => Object.keys(record.formulas).length))
    return { records, errors: [] }
  const output = await engine({
    kind: 'chain',
    today,
    records: records.map(({ date, values, formulas }) => ({
      date,
      values,
      formulas,
    })),
  })
  const errors: Array<{ line: number; message: string }> = []
  // Records come in document order, so a record's parent is done before it.
  const done = new Map<number, Record<string, unknown>>()
  return {
    records: records.map((record, i) => {
      const computed = output.records[i]
      for (const [name, message] of Object.entries(computed?.errors ?? {}))
        errors.push({ line: record.line, message: `${name}: ${message}` })
      const fromParent =
        record.parent === null ? {} : (done.get(record.parent) ?? {})
      const values = { ...fromParent, ...record.values, ...computed?.values }
      done.set(record.id, values)
      return { ...record, values }
    }),
    errors,
  }
}
