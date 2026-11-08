// SOURCING: react-markdown + remark-gfm (read-only rendering of a note's Markdown), remark-math + rehype-katex for math, the note kinds' blocks and MermaidDiagram for what a note holds
import 'katex/dist/katex.min.css'
import Markdown from 'react-markdown'
import type { Components, ExtraProps } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { MermaidDiagram } from '@/components/assistant-ui/elements/mermaid-diagram'
import { Icon } from '@/components/icons'
import { EMBED_LANGUAGE, parseEmbed } from '@/lib/theorem/embeds'
import { cn } from '@/lib/utils'
import { DataTable, EmbedBlock, NoteImage } from './kinds/embed-block'

const REMARK = [remarkGfm, remarkMath]
const REHYPE = [rehypeKatex]

/** Embeds inside an excerpt collapse to a chip; a card inside a card would recurse. */
function EmbedChip({ source }: { source: string }) {
  const ref = parseEmbed(source)
  return (
    <span className="not-prose inline-flex items-center gap-1 rounded-md bg-frame px-1.5 py-0.5 text-xs text-ink-muted">
      <Icon.Link className="size-3" />
      {ref?.title ?? ref?.id ?? 'Embed'}
    </span>
  )
}

const flat: Components = {
  code({ className, children, ...props }) {
    if (className === `language-${EMBED_LANGUAGE}`)
      return <EmbedChip source={String(children)} />
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
}

/** The fence a <pre> holds, read from the tree react-markdown is rendering. */
function fenceOf(node: ExtraProps['node']) {
  const code = node?.children[0]
  if (code?.type !== 'element' || code.tagName !== 'code') return undefined
  const classes = code.properties.className
  const name = Array.isArray(classes) ? String(classes[0] ?? '') : ''
  if (!name.startsWith('language-')) return undefined
  const text = code.children[0]
  return {
    language: name.slice('language-'.length),
    source: text?.type === 'text' ? text.value : '',
  }
}

const live: Components = {
  pre({ node, children, ...props }) {
    const fence = fenceOf(node)
    if (fence?.language === 'mermaid')
      return <MermaidDiagram code={fence.source} className="not-prose" />
    if (fence?.language === 'csv') return <DataTable csv={fence.source} />
    if (fence?.language === EMBED_LANGUAGE) {
      const embed = parseEmbed(fence.source)
      return !embed || embed.kind === 'document' ? (
        <EmbedChip source={fence.source} />
      ) : (
        <div className="not-prose my-2">
          <EmbedBlock embed={embed} />
        </div>
      )
    }
    return <pre {...props}>{children}</pre>
  },
  img: ({ src, alt }) => (
    <NoteImage
      src={typeof src === 'string' ? src : undefined}
      alt={alt}
      className="max-w-full rounded-md"
    />
  ),
}

export function NoteExcerpt({
  markdown,
  live: showLive = false,
  className,
}: {
  markdown: string
  /** Show what the note holds as itself, rather than as chips. */
  live?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'prose prose-theorem max-w-none text-sm leading-5 [&_.contains-task-list]:list-none [&_.contains-task-list]:ps-0 [&_.task-list-item]:ps-0 [&_pre]:rounded-md [&_pre]:bg-frame',
        className,
      )}
    >
      <Markdown
        remarkPlugins={REMARK}
        rehypePlugins={REHYPE}
        components={showLive ? live : flat}
      >
        {markdown}
      </Markdown>
    </div>
  )
}

/** Marks an embed card; the editor opens the note on a click inside one. */
export const EMBED_ATTR = 'data-theorem-embed'

/**
 * A theorem-embed card: the embedded note's Markdown, which opens with its
 * title, or the title alone when the note is unavailable.
 */
export function EmbedCard({
  documentId,
  title,
  markdown,
}: {
  documentId: string
  title: string
  /** Undefined when the note is unavailable. */
  markdown: string | undefined
}) {
  return (
    <button
      type="button"
      {...{ [EMBED_ATTR]: documentId }}
      // Box styles live in styles.css: Crepe's reset outranks utilities here.
      className="flex w-full cursor-pointer flex-col gap-1 text-start"
    >
      <span className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Icon.Article className="size-3.5" />
        Note
      </span>
      {markdown === undefined ? (
        <>
          <span className="text-sm font-medium text-ink">{title}</span>
          <span className="text-xs text-ink-muted">
            This note is unavailable.
          </span>
        </>
      ) : (
        <NoteExcerpt
          markdown={markdown}
          className="line-clamp-6 text-ink-muted"
        />
      )}
    </button>
  )
}
