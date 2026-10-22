// SOURCING: hand-rolled. A Theorem tool call carries only its name; no library maps an agent's tool names to the owned Noun glyphs in src/components/icons.tsx
//
// How a tool call presents itself: a readable name, the kind of work it does,
// and the glyph for that kind. The name is the only signal a call carries, so
// the kind is read off it. Namespaced names (`mcp__github__create_issue`,
// `rustyred.search`) name their provider, which then stands in for the kind.
import type { ComponentProps, ElementType } from 'react'
import { Icon } from '@/components/icons'
import { cn } from '@/lib/utils'

export type ToolIdentity = {
  /** "Create issue" for `create_issue`. */
  label: string
  /** "Web", "Files", or the provider of a namespaced tool. */
  category: string
  Glyph: ElementType
}

// Matched at the start of a word of the name, so `read` finds `read_file`
// but not `threads`. First match wins: specific kinds before broad ones.
// The glyphs are the plainest owned marks for each kind; the illustrative
// record marks (coding, database, diagram, article) blur at tile size.
const KINDS: Array<[RegExp, string, ElementType]> = [
  [/\b(?:web|browse|fetch|url|http|scrape|crawl)/, 'Web', Icon.Web],
  [/\b(?:search|grep|find|query|lookup)/, 'Search', Icon.Search],
  [
    /\b(?:memory|recall|remember|encode|graph|index|database|sql)/,
    'Memory',
    Icon.Index,
  ],
  [
    /\b(?:exec|run|shell|bash|terminal|command|code|python|eval)/,
    'Code',
    Icon.Script,
  ],
  [/\b(?:file|read|write|edit|patch|dir|path)/, 'Files', Icon.File],
  [/\b(?:e?mail|message|slack|send|notify)/, 'Messages', Icon.Message],
  [/\b(?:diagram|mermaid|chart)/, 'Diagrams', Icon.Hierarchy],
  [/\b(?:artifact|doc|note|page)/, 'Documents', Icon.Page],
]

const words = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase())

const sentence = (name: string) => {
  const text = words(name).join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const title = (name: string) =>
  words(name)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

export function toolIdentity(toolName: string): ToolIdentity {
  const segments = toolName.split(/__|\./).filter(Boolean)
  const name = segments.at(-1) ?? toolName
  const provider = segments.filter((s) => s !== 'mcp').at(-2)
  const spoken = words(toolName).join(' ')
  const kind = KINDS.find(([pattern]) => pattern.test(spoken))
  return {
    label: sentence(name) || toolName,
    category: provider ? title(provider) : (kind?.[1] ?? 'Tool'),
    Glyph: kind?.[2] ?? Icon.Settings,
  }
}

/** The glyph of a tool's kind on a small raised tile. */
export function ToolTile({
  toolName,
  className,
  ...props
}: ComponentProps<'span'> & { toolName: string }) {
  const { Glyph } = toolIdentity(toolName)
  return (
    <span
      data-slot="tool-tile"
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md bg-raised text-ink ring-1 ring-separator/70 ring-inset',
        className,
      )}
      {...props}
    >
      {/* A glyph carries less ink per pixel than text, so it sits a step
          above the muted label to read at the same weight. */}
      <Glyph className="size-[72%]" />
    </span>
  )
}
