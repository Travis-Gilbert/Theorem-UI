// SOURCING: mdast-util-from-markdown with micromark-extension-frontmatter and
// mdast-util-frontmatter (where the frontmatter ends, by the rules the index
// uses) and yaml's Document API (setting one property keeps the rest of the
// block as written, comments included).
//
// The Markdown editor shows a note's body; its frontmatter is edited as
// properties. Splitting keeps the head's bytes, so a body edit leaves the
// frontmatter exactly as it was.
import { fromMarkdown } from 'mdast-util-from-markdown'
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter'
import { frontmatter } from 'micromark-extension-frontmatter'
import { isMap, parseDocument } from 'yaml'

export interface SplitNote {
  /** The frontmatter block with its line break, or ''. `head + body` is the file. */
  head: string
  /** The YAML between the fences. */
  yaml: string
  body: string
}

export function splitFrontmatter(text: string): SplitNote {
  const tree = fromMarkdown(text, {
    extensions: [frontmatter(['yaml'])],
    mdastExtensions: [frontmatterFromMarkdown(['yaml'])],
  })
  const first = tree.children[0]
  const end = first?.type === 'yaml' ? first.position?.end.offset : undefined
  if (first?.type !== 'yaml' || end === undefined)
    return { head: '', yaml: '', body: text }
  const eol = /^\r?\n/.exec(text.slice(end))?.[0] ?? ''
  return {
    head: text.slice(0, end + eol.length),
    yaml: first.value,
    body: text.slice(end + eol.length),
  }
}

/** The properties as a map, or null when the YAML is not one. */
export function readProperties(yaml: string): Record<string, unknown> | null {
  if (!yaml.trim()) return {}
  const doc = parseDocument(yaml)
  if (doc.errors.length) return null
  const value: unknown = doc.toJS()
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * The head with one property set, or removed when `value` is undefined. An
 * empty map drops the block; a note without one gains it.
 */
export function writeProperty(
  { head, yaml }: Pick<SplitNote, 'head' | 'yaml'>,
  key: string,
  value: unknown,
): string {
  const eol = head.includes('\r\n') ? '\r\n' : '\n'
  const doc = parseDocument(yaml)
  if (doc.contents !== null && !isMap(doc.contents))
    throw new Error('The frontmatter is not a map of properties.')
  if (value === undefined) doc.delete(key)
  else doc.set(key, value)
  if (!isMap(doc.contents) || doc.contents.items.length === 0) return ''
  const inner = doc.toString({
    lineWidth: 0,
    // As Obsidian writes them: `key:` for an empty value, `[a, b]` lists.
    nullStr: '',
    flowCollectionPadding: false,
  })
  return `---${eol}${inner.replaceAll('\n', eol)}---${eol}`
}
