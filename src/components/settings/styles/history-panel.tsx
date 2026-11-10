// SOURCING: lib/theorem/response-styles revision queries (a restore writes a new revision, it never rewinds), coss ui Alert and Badge, the confirm dialog and text diff beside it
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/coss/alert'
import { Badge } from '@/components/coss/badge'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import {
  useFrameworkRevision,
  useFrameworkRevisions,
  useStyleRevision,
  useStyleRevisions,
} from '@/lib/theorem/response-styles'
import type {
  ResponseFrameworkDetail,
  ResponseStyleDetail,
  RestoreTarget,
  RevisionCause,
  RevisionSummary,
  ShippedInfo,
} from '@/lib/theorem/response-styles'
import { ConfirmAction } from './confirm-action'
import {
  frameworkText,
  styleText,
  toFrameworkDraft,
  toStyleDraft,
  when,
} from './style-text'
import { TextDiff } from './text-diff'

const CAUSE: Readonly<Record<RevisionCause, string>> = {
  edit: 'Edit',
  restore: 'Restore',
  reset: 'Reset to shipped',
  duplicate: 'Duplicate',
}

/** The shipped baseline was never saved, so the server names no cause for it. */
const BASELINE = 'Shipped baseline'

type Target = number | 'shipped'

type ViewProps = {
  noun: 'style' | 'framework'
  origin: 'shipped' | 'user'
  currentRevision: number
  shipped: ShippedInfo | null
  revisions: {
    data?: RevisionSummary[]
    isPending: boolean
    error: unknown
  }
  target: Target | undefined
  /** The compared revision's text, once it has loaded. */
  comparedText: string | undefined
  comparedError: unknown
  /** The saved revision's text: what a comparison is against. */
  currentText: string
  /** The editor holds changes a restore would replace. */
  dirty: boolean
  busy: boolean
  /** A refusal that is not a conflict; a conflict has its own notice. */
  error: unknown
  onCompare: (target: Target | undefined) => void
  onRestore: (to: RestoreTarget) => void
}

function HistoryView({
  noun,
  origin,
  currentRevision,
  shipped,
  revisions,
  target,
  comparedText,
  comparedError,
  currentText,
  dirty,
  busy,
  error,
  onCompare,
  onRestore,
}: ViewProps) {
  const replaces = dirty
    ? ' The changes in the editor that are not saved will be replaced.'
    : ''
  const edited = origin === 'shipped' && currentRevision > 0
  const diffBody = (
    <>
      {comparedError !== undefined && comparedError !== null && (
        <p role="alert" className="text-sm text-error-ink">
          {describeError(comparedError)}
        </p>
      )}
      {comparedText === undefined &&
        (comparedError === undefined || comparedError === null) && (
          <p className="text-sm text-ink-muted">Loading the version.</p>
        )}
    </>
  )
  return (
    <div className="flex flex-col gap-4">
      {shipped?.updateAvailable && (
        <Alert variant="info">
          <AlertTitle>Theorem has a newer shipped version</AlertTitle>
          <AlertDescription>
            <p>
              Your edited {noun} was made from an older shipped one. Yours is
              unchanged until you take the new one.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="xs"
                variant="outline"
                aria-expanded={target === 'shipped'}
                onClick={() =>
                  onCompare(target === 'shipped' ? undefined : 'shipped')
                }
              >
                Compare with the new shipped version
              </Button>
              <ConfirmAction
                label="Take the shipped version"
                title="Take the shipped version?"
                description={`This saves a new revision holding Theorem's shipped text. Your own revisions stay in the history, so you can restore any of them.${replaces}`}
                confirmLabel="Take the shipped version"
                disabled={busy}
                onConfirm={() => onRestore('shipped')}
              />
            </div>
            {target === 'shipped' && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-ink-muted">
                  What taking the shipped version would change in your current
                  revision.
                </p>
                {comparedText !== undefined && (
                  <TextDiff
                    before={currentText}
                    after={comparedText}
                    name={`${noun}.md`}
                  />
                )}
                {diffBody}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
      {edited && (
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmAction
            label="Reset to shipped"
            title="Reset to the shipped version?"
            description={`This saves a new revision holding Theorem's shipped text. Your own revisions stay in the history, so you can restore any of them.${replaces}`}
            confirmLabel="Reset to shipped"
            disabled={busy}
            onConfirm={() => onRestore('shipped')}
          />
          <span className="text-xs text-ink-muted">
            Go back to the text Theorem ships.
          </span>
        </div>
      )}
      {error !== undefined && error !== null && (
        <p role="alert" className="text-sm text-error-ink">
          {describeError(error)}
        </p>
      )}
      {revisions.isPending ? (
        <p className="text-sm text-ink-muted">Loading the history.</p>
      ) : revisions.error ? (
        <p role="alert" className="text-sm text-error-ink">
          {describeError(revisions.error)}
        </p>
      ) : (
        <ol aria-label="Revisions" className="flex flex-col gap-2">
          {revisions.data?.map((item) => {
            const current = item.revision === currentRevision
            return (
              <li
                key={item.revision}
                className="flex flex-col gap-2 rounded-lg border border-separator px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">
                    Revision {item.revision}
                  </span>
                  <Badge variant="outline">
                    {item.cause ? CAUSE[item.cause] : BASELINE}
                  </Badge>
                  {current && <Badge variant="secondary">Current</Badge>}
                  {/* The shipped baseline was never saved, so it has no time. */}
                  {item.savedAtMs > 0 && (
                    <span className="text-xs text-ink-muted">
                      {when(item.savedAtMs)}
                    </span>
                  )}
                </div>
                {!current && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      aria-label={`Compare revision ${item.revision} with current`}
                      aria-expanded={target === item.revision}
                      onClick={() =>
                        onCompare(
                          target === item.revision ? undefined : item.revision,
                        )
                      }
                    >
                      Compare with current
                    </Button>
                    <ConfirmAction
                      label="Restore this version"
                      ariaLabel={`Restore revision ${item.revision}`}
                      title={`Restore revision ${item.revision}?`}
                      description={`This saves a new revision holding the text of revision ${item.revision}. Nothing is deleted: every revision stays in the history.${replaces}`}
                      confirmLabel="Restore this version"
                      disabled={busy}
                      onConfirm={() => onRestore(item.revision)}
                    />
                  </div>
                )}
                {target === item.revision && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-ink-muted">
                      What changed from revision {item.revision} to the current
                      revision {currentRevision}.
                    </p>
                    {comparedText !== undefined && (
                      <TextDiff
                        before={comparedText}
                        after={currentText}
                        name={`${noun}.md`}
                      />
                    )}
                    {diffBody}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

type Shared = {
  dirty: boolean
  busy: boolean
  error: unknown
  onRestore: (to: RestoreTarget) => void
}

/** A style's history, with the names of its frameworks read from the catalog. */
export function StyleHistory({
  detail,
  frameworkName,
  ...shared
}: Shared & {
  detail: ResponseStyleDetail
  frameworkName: (id: string) => string
}) {
  const [target, setTarget] = useState<Target>()
  const revisions = useStyleRevisions(detail.id)
  const compared = useStyleRevision(detail.id, target)
  return (
    <HistoryView
      {...shared}
      noun="style"
      origin={detail.origin}
      currentRevision={detail.revision}
      shipped={detail.shipped}
      revisions={revisions}
      target={target}
      comparedText={
        compared.data
          ? styleText(toStyleDraft(compared.data), frameworkName)
          : undefined
      }
      comparedError={compared.error}
      currentText={styleText(toStyleDraft(detail), frameworkName)}
      onCompare={setTarget}
    />
  )
}

export function FrameworkHistory({
  detail,
  ...shared
}: Shared & { detail: ResponseFrameworkDetail }) {
  const [target, setTarget] = useState<Target>()
  const revisions = useFrameworkRevisions(detail.id)
  const compared = useFrameworkRevision(detail.id, target)
  return (
    <HistoryView
      {...shared}
      noun="framework"
      origin={detail.origin}
      currentRevision={detail.revision}
      shipped={detail.shipped}
      revisions={revisions}
      target={target}
      comparedText={
        compared.data
          ? frameworkText(toFrameworkDraft(compared.data))
          : undefined
      }
      comparedError={compared.error}
      currentText={frameworkText(toFrameworkDraft(detail))}
      onCompare={setTarget}
    />
  )
}
