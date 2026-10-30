// SOURCING: ui/dialog over Base UI Dialog (the review), ./view-renderer (the candidate rendered live, as it would run), ./validate (OpenUI's own parser for the client check), @tanstack/react-query hooks in ./queries for proposals, interpretations and their resolution
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import type { Interpretation, Proposal, Scope } from './contract'
import { observer } from './observe'
import {
  useInterpretations,
  useProposalAction,
  useProposals,
  useRecordValidation,
} from './queries'
import { checkProgram } from './validate'
import { ViewRenderer } from './view-renderer'

// A notice is shown once per page load, however often the list refetches.
const shown = new Set<string>()

const INTERPRETATION_TEXT: Record<Interpretation['kind'], string> = {
  used_together: 'These documents were opened together',
  recurring_query: 'The same search kept coming back',
  presentation_preference: 'The same presentation kept being chosen',
  poorly_fit: 'These documents did not fit where they were filed',
}

/** The proposals that belong where the person is: new views for this scope, revisions of this view. */
const relevant = (proposal: Proposal, viewId: string) =>
  proposal.kind === 'new_view' || proposal.targetViewId === viewId

/**
 * What the improver prepared, as quiet notices above the view. Nothing here
 * replaces what is open: a proposal is reviewed, accepted or dismissed, and an
 * automatically applied one can be reverted.
 */
export function ProposalNotices({
  scope,
  viewId,
  onOpenView,
}: {
  scope: Scope
  viewId: string
  onOpenView: (viewId: string) => void
}) {
  const proposals = useProposals(scope)
  const action = useProposalAction()
  // Held by id, so the review shows the proposal as Theorem now has it.
  const [reviewingId, setReviewingId] = useState<string>()
  const reviewing = proposals.data?.find((p) => p.proposalId === reviewingId)
  const visible = (proposals.data ?? []).filter((p) => relevant(p, viewId))

  useEffect(() => {
    for (const proposal of visible) {
      if (shown.has(proposal.proposalId)) continue
      shown.add(proposal.proposalId)
      observer().record({
        kind: 'proposal_shown',
        scope,
        viewId: proposal.targetViewId,
        detail: { proposalId: proposal.proposalId, status: proposal.status },
      })
    }
  })

  if (!visible.length) return null
  return (
    <div className="mb-5 flex flex-col gap-2">
      {visible.map((proposal) => (
        <div
          key={proposal.proposalId}
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-teal/30 bg-teal-container/40 px-3 py-2 text-sm"
        >
          <p className="min-w-0 flex-1">
            <span className="font-medium">
              {proposal.status === 'applied'
                ? `Theorem added “${proposal.candidate.title}”.`
                : `Theorem prepared “${proposal.candidate.title}”.`}
            </span>{' '}
            <span className="text-ink-muted">{proposal.hypothesis}</span>
          </p>
          <span className="flex gap-1">
            {proposal.status === 'applied' &&
              proposal.resultViewId &&
              proposal.resultViewId !== viewId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenView(proposal.resultViewId!)}
                >
                  Open
                </Button>
              )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReviewingId(proposal.proposalId)}
            >
              Review
            </Button>
            {proposal.status === 'applied' ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={action.isPending}
                onClick={() => action.mutate({ proposal, action: 'revert' })}
              >
                Revert
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={action.isPending}
                onClick={() => action.mutate({ proposal, action: 'dismiss' })}
              >
                Dismiss
              </Button>
            )}
          </span>
        </div>
      ))}
      {action.error && (
        <p role="alert" className="text-xs text-error-ink">
          {describeError(action.error)}
        </p>
      )}
      {reviewing && (
        <ProposalReview
          proposal={reviewing}
          onClose={() => setReviewingId(undefined)}
          onOpenView={onOpenView}
        />
      )}
    </div>
  )
}

function Check({
  label,
  ok,
  detail,
}: {
  label: string
  ok: boolean
  detail: string
}) {
  return (
    <li className="flex items-baseline gap-2">
      <span
        aria-hidden="true"
        className={cn(
          'size-2 shrink-0 rounded-full',
          ok ? 'bg-teal' : 'bg-ochre',
        )}
      />
      <span className="font-medium">{label}</span>
      <span className="min-w-0 text-ink-muted">{detail}</span>
    </li>
  )
}

/**
 * The review: why Theorem thinks this helps, the evidence it counted, whether
 * the candidate is sound, and the candidate itself, running against the
 * person's material exactly as it would once accepted.
 */
function ProposalReview({
  proposal,
  onClose,
  onOpenView,
}: {
  proposal: Proposal
  onClose: () => void
  onOpenView: (viewId: string) => void
}) {
  const interpretations = useInterpretations(proposal.scope, true)
  const interpretation = interpretations.data?.find(
    (i) => i.interpretationId === proposal.interpretationId,
  )
  const action = useProposalAction()
  const validate = useRecordValidation()
  const { bindings, lint, client } = proposal.validation

  // Theorem lints the program by name; only this build's parser can say it
  // renders, so the first review reports that back once.
  const checked = useRef(false)
  useEffect(() => {
    if (client || checked.current) return
    checked.current = true
    const result = checkProgram(
      proposal.candidate.program,
      proposal.candidate.bindings,
    )
    validate.mutate({
      proposalId: proposal.proposalId,
      ok: result.ok,
      detail: result.ok
        ? 'Parses with this build’s library.'
        : result.problems.join(' '),
    })
  }, [client, proposal, validate])

  const resolve = (kind: 'accept' | 'dismiss' | 'revert') =>
    action.mutate(
      { proposal, action: kind },
      {
        onSuccess: (result) => {
          onClose()
          if (kind === 'accept' && 'view' in result)
            onOpenView(result.view.viewId)
        },
      },
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{proposal.candidate.title}</DialogTitle>
          <DialogDescription>{proposal.hypothesis}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
                Evidence
              </h3>
              {interpretation ? (
                <p className="text-sm">
                  {INTERPRETATION_TEXT[interpretation.kind]}, in{' '}
                  {interpretation.support}{' '}
                  {interpretation.support === 1
                    ? 'session'
                    : 'separate sessions'}
                  .
                </p>
              ) : (
                <p className="text-sm text-ink-muted">
                  {interpretations.isPending
                    ? 'Reading…'
                    : 'The evidence has since changed.'}
                </p>
              )}
              <p className="text-xs text-ink-faint">
                {proposal.candidate.purpose} Composed by {proposal.composedBy}.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
                Checks
              </h3>
              <ul className="flex flex-col gap-1 text-sm">
                <Check
                  label="Bindings"
                  ok={bindings.ok}
                  detail={`${bindings.covered} of ${bindings.expected} documents. ${bindings.detail}`}
                />
                <Check label="Program" ok={lint.ok} detail={lint.detail} />
                {client ? (
                  <Check
                    label="Renders"
                    ok={client.ok}
                    detail={client.detail}
                  />
                ) : (
                  <Check label="Renders" ok detail="Checking…" />
                )}
              </ul>
            </div>
          </section>
          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
              Preview
            </h3>
            <div className="rounded-lg border border-separator p-4">
              <ViewRenderer definition={proposal.candidate} />
            </div>
          </section>
          {action.error && (
            <p role="alert" className="text-xs text-error-ink">
              {describeError(action.error)}
            </p>
          )}
        </div>
        <DialogFooter>
          {proposal.status === 'applied' ? (
            <Button
              variant="outline"
              disabled={action.isPending}
              onClick={() => resolve('revert')}
            >
              Revert
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                disabled={action.isPending}
                onClick={() => resolve('dismiss')}
              >
                Dismiss
              </Button>
              <Button
                disabled={action.isPending || client?.ok === false}
                onClick={() => resolve('accept')}
              >
                {proposal.kind === 'new_view'
                  ? 'Add this view'
                  : 'Use this revision'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
