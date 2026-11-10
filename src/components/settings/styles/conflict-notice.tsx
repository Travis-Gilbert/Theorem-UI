// SOURCING: coss ui Alert, ui/button; the 412 `response_style_changed` answer of SPEC-THEOREM-RESPONSE-STYLES-1.0 section 7 (a save carried a revision someone else has since replaced)
import { Alert, AlertDescription, AlertTitle } from '@/components/coss/alert'
import { Button } from '@/components/ui/button'
import { TextDiff } from './text-diff'

/**
 * A save met a newer revision. Nothing was lost: the person's text is still in
 * the editor. Reload takes the newer one; Keep leaves the text and shows how
 * the two differ, so the next save is a deliberate one over it.
 */
export function ConflictNotice({
  noun,
  busy,
  theirs,
  mine,
  onReload,
  onKeep,
}: {
  noun: 'style' | 'framework'
  busy: boolean
  /** The version saved elsewhere, once the person asked to compare. */
  theirs?: string
  mine: string
  onReload: () => void
  onKeep: () => void
}) {
  return (
    <Alert variant="warning">
      <AlertTitle>This {noun} changed elsewhere</AlertTitle>
      <AlertDescription>
        <p>
          Someone saved a newer version after you opened it, so your save was
          not made. Your text is still here.
        </p>
        {theirs !== undefined && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-ink-muted">
              From the version saved elsewhere to your text. Saving now replaces
              the version saved elsewhere.
            </p>
            <TextDiff before={theirs} after={mine} name={`${noun}.md`} />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="xs"
            variant="outline"
            disabled={busy}
            onClick={onReload}
          >
            Reload
          </Button>
          {theirs === undefined && (
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={onKeep}
            >
              Keep my text and compare
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}
