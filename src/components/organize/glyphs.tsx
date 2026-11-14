// SOURCING: lucide-react file marks (FileText, FileTerminal, FileCheck2, FileCode, FileCog) for session types, components/icons for the folder and the rest of the owned set. A row's icon says what kind of thing it is, and the person decides that: a project is a folder; a session wears its chosen type (lib/theorem/sidebar-prefs), a Conversation until one is chosen. The Librarian's topic glyph is no longer drawn as the icon; it stays in the organization record as metadata.
import {
  FileCheck2,
  FileCode,
  FileCog,
  FileTerminal,
  FileText,
} from 'lucide-react'
import type { ComponentProps, ComponentType } from 'react'
import { Icon } from '@/components/icons'
import { useSessionType } from '@/lib/theorem/sidebar-prefs'
import type { TypeMark } from '@/lib/theorem/sidebar-prefs'
import { cn } from '@/lib/utils'

type Mark = ComponentType<ComponentProps<'svg'>>

export const TYPE_MARK: Readonly<Record<TypeMark, Mark>> = {
  document: FileText,
  'terminal-file': FileTerminal,
  'checklist-file': FileCheck2,
  'code-file': FileCode,
  'cog-file': FileCog,
  chat: Icon.Thread,
  graph: Icon.Graph,
  research: Icon.Skill,
}

export const TYPE_MARK_LABEL: Readonly<Record<TypeMark, string>> = {
  document: 'Document',
  'terminal-file': 'File with terminal',
  'checklist-file': 'File with checklist',
  'code-file': 'Code file',
  'cog-file': 'File with gear',
  chat: 'Chat bubble',
  graph: 'Graph',
  research: 'Research',
}

type MarkProps = ComponentProps<'svg'>

/** A mark by name, for type pickers and graph nodes. */
export function TypeMarkIcon({
  mark,
  className,
  ...props
}: MarkProps & { mark: TypeMark }) {
  const Mark = TYPE_MARK[mark]
  return (
    <Mark
      aria-hidden
      strokeWidth={1.75}
      {...props}
      className={cn('size-4 shrink-0', className)}
    />
  )
}

/** A session's mark: its chosen type's, a document until one is chosen. */
export function SessionGlyph({
  threadId,
  ...props
}: MarkProps & { threadId: string }) {
  const type = useSessionType(threadId)
  return <TypeMarkIcon mark={type.mark} {...props} />
}

/** A project's mark: always the folder files are listed with. */
export function ProjectGlyph(props: MarkProps) {
  return <Icon.Folder {...props} />
}
