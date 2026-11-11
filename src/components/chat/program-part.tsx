// SOURCING: @assistant-ui/react data parts; the installed CollapsibleRoot over
// Base UI Collapsible; the chat's Shiki highlighter (shiki-highlighter.tsx),
// as its code blocks use it. What a program part says and when it is drawn is
// this app's.
import { useAuiState } from '@assistant-ui/react'
import type { DataMessagePartComponent } from '@assistant-ui/react'
import { useState } from 'react'
import {
  CollapsibleContent,
  CollapsibleRoot,
  CollapsibleTrigger,
} from '@/components/assistant-ui/elements/collapsible-root'
import { SyntaxHighlighter } from '@/components/assistant-ui/elements/shiki-highlighter'
import { liveEnter } from '@/components/assistant-ui/elements/surfaces'
import { Icon } from '@/components/icons'
import { cn } from '@/lib/utils'

/** The languages a turn's program is written in, as a person names them and as Shiki does. */
const PYTHON = { name: 'Python', shiki: 'python' }
const LANGUAGES: Partial<Record<string, { name: string; shiki: string }>> = {
  monty: PYTHON,
  python: PYTHON,
  typescript: { name: 'TypeScript', shiki: 'typescript' },
}

export interface ProgramSummary {
  source: string
  /** The language as a person names it. */
  language: string
  /** The language as the highlighter names it. */
  shiki: string
  lines: number
  /** The source is still arriving. */
  writing: boolean
  /** The source was cut where it was sent, and this is its start. */
  cut: boolean
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

/**
 * What the chat says of a program part, or null where it draws nothing.
 *
 * A turn's native tool calls are also recorded as a program, one line a call,
 * and those are already drawn as the calls they are. Only a program the model
 * wrote as code (`authored`) is shown as one.
 */
export function programSummary(
  data: unknown,
  running: boolean,
): ProgramSummary | null {
  const program = record(data)
  const source = typeof program.source === 'string' ? program.source : ''
  if (program.authored !== true || !source.trim()) return null
  const named =
    typeof program.language === 'string' ? program.language.toLowerCase() : ''
  const language = LANGUAGES[named] ?? PYTHON
  return {
    source,
    language: language.name,
    shiki: language.shiki,
    lines: source.trimEnd().split('\n').length,
    writing: program.streaming === true && running,
    cut: program.truncated === true,
  }
}

/**
 * A program the agent wrote and ran in its turn: that it wrote one, in what
 * language, and its source when the row is opened. What the program did is
 * drawn by the calls it made, which follow it.
 */
export const ProgramPart: DataMessagePartComponent = ({ data }) => {
  const running = useAuiState((s) => s.message.status?.type === 'running')
  const [open, setOpen] = useState(false)
  const program = programSummary(data, running)
  if (!program) return null
  const size = program.lines === 1 ? '1 line' : `${program.lines} lines`
  return (
    <CollapsibleRoot
      open={open}
      onOpenChange={setOpen}
      data-part="theorem-program"
      className={cn(
        'my-2 overflow-hidden rounded-md border border-separator bg-raised',
        liveEnter,
      )}
    >
      <CollapsibleTrigger
        className="flex w-full items-center gap-1.5 px-2 py-1 text-start text-xs font-semibold text-ink-muted hover:text-ink"
        aria-label={`${open ? 'Hide' : 'Show'} the ${program.language} program the agent wrote`}
      >
        <Icon.Next
          className={cn(
            'size-3 shrink-0 text-ink-faint transition-transform duration-100',
            open && 'rotate-90',
          )}
        />
        <Icon.Code
          className={cn(
            'size-3 shrink-0',
            program.writing && 'animate-pulse motion-reduce:animate-none',
          )}
        />
        <span>{program.writing ? 'Writing a program' : 'Wrote a program'}</span>
        <span className="font-normal text-ink-faint">
          {program.language} · {size}
          {program.cut && ' · start only'}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="max-h-96 overflow-auto border-t border-separator text-xs">
          <SyntaxHighlighter
            code={program.source}
            language={program.shiki}
            streaming={program.writing}
          />
        </div>
      </CollapsibleContent>
    </CollapsibleRoot>
  )
}
