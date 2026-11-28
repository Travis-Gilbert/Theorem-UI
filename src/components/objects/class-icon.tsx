// SOURCING: lucide-react (the glyphs a class can wear; already the app's stand-in set beside the owned Noun marks), the Theorem tone tokens (teal, ochre, redwood, action, insight containers) for the tinted tile, after Capacities' Object Types list where each type is a coloured icon tile beside its name
import {
  BookOpen,
  Box,
  Briefcase,
  Building2,
  Calendar,
  CircleDot,
  Code2,
  FileText,
  Flag,
  FlaskConical,
  Globe,
  GraduationCap,
  Heart,
  Image,
  Lightbulb,
  Library,
  Link2,
  ListChecks,
  MapPin,
  MessagesSquare,
  Music,
  NotebookPen,
  Package,
  Quote,
  Rocket,
  Shapes,
  Sparkles,
  Tag,
  Target,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ClassTone, ObjectClass } from '@/lib/objects/classes'
import { cn } from '@/lib/utils'

/** The glyphs a class can choose, by the name its extension stores. */
export const CLASS_ICONS: Record<string, LucideIcon> = {
  'file-text': FileText,
  code: Code2,
  notebook: NotebookPen,
  library: Library,
  box: Box,
  book: BookOpen,
  users: Users,
  briefcase: Briefcase,
  building: Building2,
  calendar: Calendar,
  flag: Flag,
  lab: FlaskConical,
  globe: Globe,
  school: GraduationCap,
  heart: Heart,
  image: Image,
  idea: Lightbulb,
  link: Link2,
  tasks: ListChecks,
  place: MapPin,
  chat: MessagesSquare,
  music: Music,
  package: Package,
  quote: Quote,
  rocket: Rocket,
  shapes: Shapes,
  sparkles: Sparkles,
  tag: Tag,
  target: Target,
  dot: CircleDot,
}

export const TONE_TILE: Record<ClassTone, string> = {
  teal: 'bg-teal-container text-teal-ink',
  ochre: 'bg-ochre-container text-ochre-ink',
  redwood: 'bg-redwood-container text-redwood-ink',
  action: 'bg-action-container text-action-ink',
  insight: 'bg-insight-container text-insight-ink',
  neutral: 'bg-pill text-ink-muted',
}

export function ClassGlyph({
  icon,
  className,
}: {
  icon: string
  className?: string
}) {
  const Glyph = CLASS_ICONS[icon] ?? Box
  return <Glyph aria-hidden="true" className={className} />
}

/** A class's icon on its tinted tile. */
export function ClassIcon({
  cls,
  size = 'sm',
  className,
}: {
  cls: Pick<ObjectClass, 'icon' | 'tone'>
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[5px]',
        TONE_TILE[cls.tone],
        size === 'sm' && 'size-[18px]',
        size === 'md' && 'size-6 rounded-md',
        size === 'lg' && 'size-9 rounded-lg',
        className,
      )}
    >
      <ClassGlyph
        icon={cls.icon}
        className={cn(
          size === 'sm' && 'size-3',
          size === 'md' && 'size-3.5',
          size === 'lg' && 'size-5',
        )}
      />
    </span>
  )
}
