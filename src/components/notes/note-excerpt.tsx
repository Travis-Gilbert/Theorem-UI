// SOURCING: react-markdown + remark-gfm (read-only rendering of a note's Markdown)
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Icon } from '@/components/icons'
import { EMBED_LANGUAGE, parseEmbed } from '@/lib/theorem/embeds'
import { cn } from '@/lib/utils'

/** Embeds inside an excerpt collapse to a chip; a card inside a card would recurse. */
const components: Components = {
  code({ className, children, ...props }) {
    if (className === `language-${EMBED_LANGUAGE}`) {
      const ref = parseEmbed(String(children))
      return (
        <span className="not-prose inline-flex items-center gap-1 rounded-md bg-frame px-1.5 py-0.5 text-xs text-ink-muted">
          <Icon.Link className="size-3" />
          {ref?.title ?? ref?.id ?? 'Embed'}
        </span>
      )
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
}

export function NoteExcerpt({
  markdown,
  className,
}: {
  markdown: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'prose prose-theorem max-w-none text-sm leading-5',
        className,
      )}
    >
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </Markdown>
    </div>
  )
}

/** Marks an embed card; the editor opens the note on a click inside one. */
export const EMBED_ATTR = 'data-theorem-embed'

/**
 * A theorem-embed card: the embedded note's Markdown, which opens with its
 * title, or the title alone when the note is unavailable. Crepe
 * sanitizes previews into static HTML, so this renders without hooks or
 * handlers and the editor delegates its click.
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
