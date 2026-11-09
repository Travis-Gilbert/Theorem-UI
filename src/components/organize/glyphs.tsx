// SOURCING: lucide-react through components/icons' own source, and the icon set's Streamline List Edit for a to-do list. A thread's or project's icon is the Librarian's word on what the work is about; rows fall back when it has not chosen.
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
import type { ComponentType, SVGProps } from 'react'
import { Icon } from '@/components/icons'
import type { Glyph } from '@/lib/theorem/organization'

const GLYPHS: Readonly<Record<Glyph, ComponentType<SVGProps<SVGSVGElement>>>> =
  {
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
    todo: Icon.Todo,
  }

type GlyphProps = SVGProps<SVGSVGElement> & { glyph?: Glyph }

export function ThreadGlyph({ glyph, ...props }: GlyphProps) {
  const Mark = glyph ? GLYPHS[glyph] : MessagesSquare
  return <Mark {...props} />
}

export function ProjectGlyph({ glyph, ...props }: GlyphProps) {
  const Mark = glyph ? GLYPHS[glyph] : Box
  return <Mark {...props} />
}
