// SOURCING: hand-roll — the save state of a file a handler edits (a change on
// disk while edits were pending, a failed write), laid out with the app's
// Button. useTextFile decides the states; this only shows them. A read-only
// Theorem entry says why, with react-query's useMutation for making an agent's
// document the person's own.
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { theoremMark } from '@/components/workspace/entry-mark'
import type { TextFile } from '@/lib/handlers/file-sync'
import type { FileViewProps } from '@/lib/handlers/types'
import { describeError } from '@/lib/theorem/client'
import { promoteEntry } from '@/lib/workspace/theorem-actions'
import { cn } from '@/lib/utils'

/** A panel's or card's whole body when there is no file to show yet. */
export function FileMessage({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-16 items-center justify-center p-4 text-center text-sm text-ink-faint',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** The usual message for a text file that is loading, unreadable or binary. */
export function textFileMessage(file: TextFile): string | null {
  if (file.isPending) return 'Loading…'
  if (file.isError || file.text === undefined)
    return 'This file could not be read.'
  if (file.isBinary) return 'This file is not text.'
  return null
}

/** A bar above an editor while its edits cannot be saved. */
export function FileStatusBar({ file }: { file: TextFile }) {
  if (file.conflict)
    return (
      <div
        role="alert"
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-separator bg-error-container px-3 py-1.5 text-xs text-error-ink"
      >
        <span className="min-w-0 flex-1">
          This file changed on disk while you were editing it.
        </span>
        <Button size="xs" variant="outline" onClick={() => void file.resolve('disk')}>
          Use the file on disk
        </Button>
        <Button size="xs" variant="outline" onClick={() => void file.resolve('mine')}>
          Keep my edits
        </Button>
      </div>
    )
  if (file.saveFailed)
    return (
      <div
        role="alert"
        className="flex shrink-0 items-center gap-2 border-b border-separator bg-error-container px-3 py-1.5 text-xs text-error-ink"
      >
        <span className="min-w-0 flex-1">Your last edit was not saved.</span>
        <Button size="xs" variant="outline" onClick={() => void file.flush()}>
          Try again
        </Button>
      </div>
    )
  return null
}

/**
 * Why a Theorem entry cannot be edited here: Theorem keeps plans, and an
 * agent's document stays the agent's until the person makes it their own.
 */
export function TheoremEntryBar({ file }: { file: FileViewProps }) {
  const source = file.entry.theorem
  const promote = useMutation({
    mutationFn: () => promoteEntry(file.client, file.path),
  })
  if (!source?.readOnly) return null
  const mark = theoremMark(source)
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-separator px-3 py-1.5 text-xs text-ink-muted">
      {mark && (
        <mark.Mark aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
      )}
      <span className="min-w-0 flex-1">
        {promote.isError
          ? `Not made yours: ${describeError(promote.error)}`
          : source.backing === 'plan'
            ? 'Theorem keeps this plan; agents change it as they work.'
            : source.agent
              ? 'An agent wrote this. Make it yours to edit it.'
              : 'This document is read-only.'}
      </span>
      {source.agent && file.client.theorem && (
        <Button
          size="xs"
          variant="outline"
          disabled={promote.isPending}
          onClick={() => promote.mutate()}
        >
          Make it mine
        </Button>
      )}
    </div>
  )
}
