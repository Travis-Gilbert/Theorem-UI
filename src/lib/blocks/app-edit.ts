// SOURCING: hand-rolled. An edit a person makes to a running App by pointing
// at an element is a change to that element's source: its literal text, or an
// attribute written as a string. This reads the one element at a known place
// with a small scanner (not a parser: it follows one opening tag and its
// children) and gives up on anything it is not sure of, which then goes to
// the agent with the selection.
import { SOURCE_TYPE } from './app-source'

/** A place in a source file, as an element's stamp gives it: `Table.tsx:26:13`. */
export interface SourcePlace {
  file: string
  /** One-based. */
  line: number
  /** One-based, at the element's `<`. */
  column: number
}

/** Reads `Table.tsx:26:13`. */
export function parsePlace(stamp: string): SourcePlace | null {
  const match = /^(.+):(\d+):(\d+)$/.exec(stamp)
  return match
    ? { file: match[1]!, line: Number(match[2]), column: Number(match[3]) }
    : null
}

/** An attribute written as a string, `title="Organizations"`. */
export interface LiteralAttribute {
  name: string
  value: string
  /** The value with its quotes, as offsets into the file. */
  start: number
  end: number
}

/** The element at a place: its tag, and what of it is written as plain text. */
export interface SourceElement {
  tag: string
  attributes: Array<LiteralAttribute>
  /** The element's children, when they are text and nothing else. */
  text?: { value: string; start: number; end: number }
  /** Where a new attribute goes: after the tag's name. */
  insertAt: number
}

const NAME = /[A-Za-z0-9_$.:-]/

/** The end of a `{…}` that starts at `from`, past strings, templates and nested braces. */
function braceEnd(source: string, from: number): number {
  let depth = 0
  for (let at = from; at < source.length; at++) {
    const char = source[at]
    if (char === '"' || char === "'" || char === '`') {
      at = stringEnd(source, at)
      if (at < 0) return -1
    } else if (char === '{') depth++
    else if (char === '}' && --depth === 0) return at + 1
  }
  return -1
}

/** The index of the quote that closes the string opened at `from`. */
function stringEnd(source: string, from: number): number {
  const quote = source[from]
  for (let at = from + 1; at < source.length; at++) {
    const char = source[at]
    if (char === '\\') at++
    else if (char === quote) return at
    // A template's `${…}` is code: skip it whole.
    else if (quote === '`' && char === '$' && source[at + 1] === '{') {
      const end = braceEnd(source, at + 1)
      if (end < 0) return -1
      at = end - 1
    }
  }
  return -1
}

const decode = (text: string) =>
  text
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

/** The offset of a one-based line and column. */
function offsetOf(source: string, line: number, column: number): number {
  let at = 0
  for (let current = 1; current < line; current++) {
    at = source.indexOf('\n', at) + 1
    if (at === 0) return -1
  }
  return at + column - 1
}

/**
 * The element whose opening tag starts at `place`, or null when the source
 * there is not one this can read: a fragment, a tag split by a comment, or a
 * place that is no longer an element because the file has changed.
 */
export function readElement(
  source: string,
  place: Pick<SourcePlace, 'line' | 'column'>,
): SourceElement | null {
  let at = offsetOf(source, place.line, place.column)
  if (at < 0 || source[at] !== '<') return null
  at++
  const nameStart = at
  while (at < source.length && NAME.test(source[at]!)) at++
  const tag = source.slice(nameStart, at)
  if (!tag) return null
  const insertAt = at
  const attributes: Array<LiteralAttribute> = []
  let selfClosed = false
  for (;;) {
    while (at < source.length && /\s/.test(source[at]!)) at++
    const char = source[at]
    if (char === undefined) return null
    if (char === '>') {
      at++
      break
    }
    if (char === '/' && source[at + 1] === '>') {
      selfClosed = true
      at += 2
      break
    }
    if (char === '{') {
      // A spread, `{...props}`.
      at = braceEnd(source, at)
      if (at < 0) return null
      continue
    }
    if (!NAME.test(char)) return null
    const attributeStart = at
    while (at < source.length && NAME.test(source[at]!)) at++
    const name = source.slice(attributeStart, at)
    while (at < source.length && /\s/.test(source[at]!)) at++
    if (source[at] !== '=') continue
    at++
    while (at < source.length && /\s/.test(source[at]!)) at++
    const opener = source[at]
    if (opener === '"' || opener === "'") {
      const end = source.indexOf(opener, at + 1)
      if (end < 0) return null
      attributes.push({
        name,
        value: decode(source.slice(at + 1, end)),
        start: at,
        end: end + 1,
      })
      at = end + 1
    } else if (opener === '{') {
      at = braceEnd(source, at)
      if (at < 0) return null
    } else return null
  }
  if (selfClosed) return { tag, attributes, insertAt }
  // Children that are text and nothing else end at this element's own close.
  const close = source.indexOf('<', at)
  if (
    close >= 0 &&
    source.startsWith(`</${tag}`, close) &&
    !source.slice(at, close).includes('{')
  ) {
    const raw = source.slice(at, close)
    if (raw.trim())
      return {
        tag,
        attributes,
        insertAt,
        text: { value: decode(raw.trim()), start: at, end: close },
      }
  }
  return { tag, attributes, insertAt }
}

const attributeLiteral = (value: string) =>
  `"${value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`

/** Text as JSX children: as written when it can be, as a string in braces otherwise. */
const textLiteral = (value: string) =>
  /[{}<>]/.test(value) ? `{${JSON.stringify(value)}}` : value

/** One change to the element at a place. `value` null takes an attribute away. */
export type ElementEdit =
  | { kind: 'text'; value: string }
  | { kind: 'attribute'; name: string; value: string | null }

/**
 * The file with the edits made to the element at `place`. Throws when the
 * element is not there or an edit does not apply to it: nothing is guessed.
 */
export function editElement(
  source: string,
  place: Pick<SourcePlace, 'line' | 'column'>,
  edits: ReadonlyArray<ElementEdit>,
): string {
  const element = readElement(source, place)
  if (!element) throw new Error('That element is no longer at this place.')
  const changes: Array<{ start: number; end: number; text: string }> = []
  for (const edit of edits) {
    if (edit.kind === 'text') {
      if (!element.text)
        throw new Error(`<${element.tag}> does not hold plain text here.`)
      // The text keeps the space around it, so the file's layout stays.
      const raw = source.slice(element.text.start, element.text.end)
      const lead = raw.slice(0, raw.length - raw.trimStart().length)
      const tail = raw.slice(raw.trimEnd().length)
      changes.push({
        start: element.text.start,
        end: element.text.end,
        text: lead + textLiteral(edit.value.trim()) + tail,
      })
      continue
    }
    if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(edit.name))
      throw new Error(`"${edit.name}" is not an attribute name.`)
    const existing = element.attributes.find(
      (attribute) => attribute.name === edit.name,
    )
    if (existing && edit.value === null) {
      // The attribute and the space before its name.
      const nameStart = source.lastIndexOf(edit.name, existing.start)
      const before = source.slice(0, nameStart).trimEnd().length
      changes.push({ start: before, end: existing.end, text: '' })
    } else if (existing)
      changes.push({
        start: existing.start,
        end: existing.end,
        text: attributeLiteral(edit.value!),
      })
    else if (edit.value !== null)
      changes.push({
        start: element.insertAt,
        end: element.insertAt,
        text: ` ${edit.name}=${attributeLiteral(edit.value)}`,
      })
  }
  // Last first, so earlier offsets stay true.
  changes.sort((a, b) => b.start - a.start)
  let edited = source
  for (const change of changes)
    edited =
      edited.slice(0, change.start) + change.text + edited.slice(change.end)
  return edited
}

const SOURCE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
/** An attribute's value in a tag's text, quoted either way. */
function tagAttribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    'i',
  ).exec(attributes)
  return match?.[1] ?? match?.[2]
}

/**
 * An App's HTML with one source file's text replaced, and everything else in
 * the page exactly as it was. Throws when the App has no such file, or the
 * text would end its own script element.
 */
export function writeAppSource(
  html: string,
  path: string,
  text: string,
): string {
  if (/<\/script/i.test(text))
    throw new Error('A source file cannot contain "</script".')
  const files = { written: 0 }
  const edited = html.replace(
    SOURCE_SCRIPT,
    (whole: string, attributes: string) => {
      if (
        files.written > 0 ||
        tagAttribute(attributes, 'type') !== SOURCE_TYPE ||
        tagAttribute(attributes, 'data-path') !== path
      )
        return whole
      files.written += 1
      return `<script${attributes}>${text}</script>`
    },
  )
  if (files.written === 0) throw new Error(`This App has no file "${path}".`)
  return edited
}
