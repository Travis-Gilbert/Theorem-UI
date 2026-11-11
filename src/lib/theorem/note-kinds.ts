// SOURCING: unified + remark-parse + remark-gfm + remark-math (the same Markdown grammar Crepe and NoteExcerpt read), lib/theorem/embeds. A note stays Markdown: Crepe already models text, checklists, tables, code, math and images as blocks, so a kind here is a starter for those blocks, and a typed canvas node is a note whose body is one block.
import type { Heading, RootContent } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { EMBED_LANGUAGE, embedFence, parseEmbed } from './embeds'
import type { EmbedRef } from './embeds'

/** The kinds a note starts as without picking anything first. */
export type NoteKind =
  | 'note'
  | 'text'
  | 'checklist'
  | 'table'
  | 'code'
  | 'json'
  | 'math'
  | 'diagram'
  | 'data'

const FENCE = '```'

const BLOCKS: Record<NoteKind, string> = {
  note: '',
  text: '',
  checklist: '- [ ] First thing\n- [ ] Second thing\n',
  table: '| Column | Column |\n| --- | --- |\n|  |  |\n',
  code: `${FENCE}ts\n\n${FENCE}\n`,
  json: `${FENCE}json\n{\n  "key": "value"\n}\n${FENCE}\n`,
  math: '$$\ne^{i\\pi} + 1 = 0\n$$\n',
  diagram: `${FENCE}mermaid\nflowchart LR\n  A[Start] --> B[Next]\n${FENCE}\n`,
  data: `${FENCE}csv\nname,value\nfirst,1\nsecond,2\n${FENCE}\n`,
}

export const KIND_LABEL: Record<NoteKind, string> = {
  note: 'Note',
  text: 'Text',
  checklist: 'Checklist',
  table: 'Table',
  code: 'Code',
  json: 'JSON',
  math: 'Math',
  diagram: 'Diagram',
  data: 'Data',
}

/** The bare block a kind inserts into a note that already exists. */
export const blockFor = (kind: NoteKind) => BLOCKS[kind]

/** A whole new note of this kind. A text card has no heading, so nothing labels it. */
export function starterFor(kind: NoteKind): string {
  if (kind === 'text') return ''
  const title = kind === 'note' ? 'Untitled note' : KIND_LABEL[kind]
  return `# ${title}\n\n${BLOCKS[kind]}`
}

/** A new note holding one block, under the title that names it on the canvas. */
export const noteHolding = (title: string, block: string) =>
  `# ${title}\n\n${block}`

export const fileBlock = (ref: EmbedRef) => embedFence(ref)

export const imageBlock = (url: string, alt: string) =>
  `![${alt.replace(/[[\]]/g, '')}](${url})\n`

export type FileShape = 'image' | 'audio' | 'video' | 'pdf' | 'file'

/** Which viewer a type gets. */
export function fileShape(mime: string | undefined): FileShape {
  if (!mime) return 'file'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  return 'file'
}

/** A note's body when the canvas can show it as one typed thing. */
export type NoteBody =
  | { type: 'text' }
  | { type: 'embed'; embed: EmbedRef }
  | { type: 'image'; url: string; alt: string }
  | { type: 'diagram'; code: string }

export type NoteShape = {
  /** The first heading, when the note opens with one. */
  title?: string
  /** The Markdown under that heading. */
  markdown: string
  body: NoteBody
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

const headingText = (heading: Heading) =>
  heading.children
    .map((child) => ('value' in child ? child.value : ''))
    .join('')
    .trim()

function bodyOf(node: RootContent): NoteBody {
  if (node.type === 'code') {
    const { lang, value } = node
    if (lang === 'mermaid') return { type: 'diagram', code: value }
    const embed = lang === EMBED_LANGUAGE ? parseEmbed(value) : undefined
    if (embed) return { type: 'embed', embed }
  }
  if (node.type === 'paragraph') {
    const { children } = node
    const only = children.length === 1 ? children[0] : undefined
    if (only?.type === 'image') {
      const { url, alt } = only
      return { type: 'image', url, alt: alt ?? '' }
    }
  }
  return { type: 'text' }
}

/** What a note is listed by: its first words, or the name of the first thing it holds. */
export function noteLabel(markdown: string): string | undefined {
  for (const node of parser.parse(markdown).children) {
    const held = bodyOf(node)
    if (held.type === 'embed') return held.embed.title ?? held.embed.id
    if (held.type === 'image' && held.alt) return held.alt
    if (node.type === 'code' || node.type === 'html' || held.type !== 'text')
      continue
    const start = node.position?.start.offset ?? 0
    const end = node.position?.end.offset ?? markdown.length
    const line = markdown
      .slice(start, end)
      .split('\n')[0]
      ?.replace(/^#{1,6}\s+/, '')
      .trim()
    if (line) return line
  }
  return undefined
}

/** What a note is on a canvas: its title, and what its body shows. */
export function noteShape(markdown: string): NoteShape {
  const { children } = parser.parse(markdown)
  const first = children[0]
  const heading = first?.type === 'heading' ? (first) : undefined
  const blocks = heading ? children.slice(1) : children
  const end = heading?.position?.end.offset ?? 0
  const body = blocks.length === 1 && blocks[0] ? bodyOf(blocks[0]) : { type: 'text' as const }
  return {
    ...(heading ? { title: headingText(heading) } : {}),
    markdown: markdown.slice(end).replace(/^\s*\n/, ''),
    body,
  }
}
