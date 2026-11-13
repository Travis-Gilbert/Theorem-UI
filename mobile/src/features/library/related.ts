// SOURCING: none. Maps the Files API's links, backlinks and suggestions to rows that say how each connects. Pure.
//
// Explicit links are ones someone wrote: a wikilink, a Markdown link, an
// embed, a "related" mark. Suggestions are Theorem's own proposals, scored,
// with a reason. The two are never mixed: a suggestion is not a link.
import type { Theorem } from '@theoremharness/sdk'
import { titleFromPath } from './model'

export type Related = {
  path: string
  title: string
  /** How it connects, in a sentence. */
  how: string
  explicit: boolean
}

const quoted = (heading?: string) => (heading ? `, under “${heading}”` : '')

const outgoingHow = (link: Theorem.FilesLink) => {
  switch (link.kind) {
    case 'embed':
      return `This item embeds it${quoted(link.heading)}`
    case 'related':
      return 'This item marks it as related'
    default:
      return `This item links to it${quoted(link.heading)}`
  }
}

const incomingHow = (link: Theorem.FilesLink) => {
  switch (link.kind) {
    case 'embed':
      return 'It embeds this item'
    case 'related':
      return 'It marks this item as related'
    default:
      return 'It links to this item'
  }
}

/** Links out of the item and links into it, one row per connected path. */
export function explicitRelated(
  path: string,
  outgoing: readonly Theorem.FilesLink[],
  incoming: readonly Theorem.FilesLink[],
): Related[] {
  const rows = new Map<string, Related>()
  const add = (target: string, how: string, direction: 'out' | 'in') => {
    if (target === path) return
    const existing = rows.get(target)
    if (!existing) rows.set(target, { path: target, title: titleFromPath(target), how, explicit: true })
    else if (!existing.how.includes(direction === 'out' ? 'This item' : 'It ')) existing.how = 'Links both ways'
  }
  for (const link of outgoing) if (link.resolved) add(link.resolved, outgoingHow(link), 'out')
  for (const link of incoming) add(link.from, incomingHow(link), 'in')
  return [...rows.values()]
}

const reasonText: Record<Theorem.FilesSuggestionReason, string> = {
  identity: 'Same identity',
  mention: 'Mentioned in the text',
  similarity: 'Similar content',
  structure: 'Similar structure',
  inference: 'Inferred by Theorem',
}

/** Suggestions Theorem rates above its threshold, best first. */
export function suggestedRelated(suggestions: readonly Theorem.FilesSuggestion[], path: string): Related[] {
  return suggestions
    .filter((suggestion) => suggestion.aboveThreshold && suggestion.targetPath !== path)
    .sort((a, b) => b.score - a.score)
    .map((suggestion) => ({
      path: suggestion.targetPath,
      title: suggestion.targetTitle || titleFromPath(suggestion.targetPath),
      how: suggestion.span?.text
        ? `${reasonText[suggestion.reason]}: “${suggestion.span.text}”`
        : reasonText[suggestion.reason],
      explicit: false,
    }))
}
