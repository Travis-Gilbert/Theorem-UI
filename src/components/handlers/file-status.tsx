// SOURCING: hand-roll — the save state of a file a handler edits (a change on
// disk while edits were pending, a failed write), laid out with the app's
// Button. useTextFile decides the states; this only shows them.
import { Button } from '@/components/ui/button'
import type { TextFile } from '@/lib/handlers/file-sync'
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
