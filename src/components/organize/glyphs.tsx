// SOURCING: lucide-react through components/icons' own source. A thread's or project's icon is the Librarian's word on what the work is about; rows fall back when it has not chosen.
import {
  Box,
  Bug,
  CodeXml,
  Database,
  FileText,
  Image,
  Layers,
  LayoutPanelLeft,
  Map as MapIcon,
  MessagesSquare,
  Search,
  SquareTerminal,
  Waypoints,
} from 'lucide-react'
import type { LucideIcon, LucideProps } from 'lucide-react'
import type { Glyph } from '@/lib/theorem/organization'

const GLYPHS: Readonly<Record<Glyph, LucideIcon>> = {
  layout: LayoutPanelLeft,
  code: CodeXml,
  stack: Layers,
  graph: Waypoints,
  doc: FileText,
  data: Database,
  image: Image,
  terminal: SquareTerminal,
  bug: Bug,
  research: Search,
  map: MapIcon,
  chat: MessagesSquare,
}

type GlyphProps = LucideProps & { glyph?: Glyph }

export function ThreadGlyph({ glyph, ...props }: GlyphProps) {
  const Mark = glyph ? GLYPHS[glyph] : MessagesSquare
  return <Mark {...props} />
}

export function ProjectGlyph({ glyph, ...props }: GlyphProps) {
  const Mark = glyph ? GLYPHS[glyph] : Box
  return <Mark {...props} />
}
