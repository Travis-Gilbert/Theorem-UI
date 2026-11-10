// SOURCING: components/icons (the owned Streamline and Noun marks the rest of Theorem draws with; Lucide only where the owned set has no mark). A thread's or project's icon is the Librarian's word on what the work is about; rows fall back when it has not chosen.
import { Bug } from 'lucide-react'
import type { ComponentProps, ComponentType } from 'react'
import { Icon } from '@/components/icons'
import type { Glyph } from '@/lib/theorem/organization'

type Mark = ComponentType<ComponentProps<'svg'>>

const GLYPHS: Readonly<Record<Glyph, Mark>> = {
  layout: Icon.Layout,
  code: Icon.Code,
  stack: Icon.Notes,
  graph: Icon.Graph,
  doc: Icon.Article,
  data: Icon.Project,
  image: Icon.NewGraph,
  terminal: Icon.Ide,
  // The owned set has no bug yet.
  bug: Bug,
  research: Icon.Skill,
  map: Icon.Route,
  chat: Icon.Chat,
}

type GlyphProps = ComponentProps<'svg'> & { glyph?: Glyph }

export function ThreadGlyph({ glyph, ...props }: GlyphProps) {
  const Mark = glyph ? GLYPHS[glyph] : Icon.Chat
  return <Mark {...props} />
}

export function ProjectGlyph({ glyph, ...props }: GlyphProps) {
  const Mark = glyph ? GLYPHS[glyph] : Icon.Folder
  return <Mark {...props} />
}
