// SOURCING: @pierre/diffs/react PatchDiff and MultiFileDiff (Shiki-highlighted diffs, the code blocks' GitHub themes), @assistant-ui/react data parts, the installed CollapsibleRoot over Base UI Collapsible, next-themes for the diff theme, ui/button
//
// Delegated work in the conversation (D20: the transcript shows one agent).
// The front role delegates a work contract to a specialist; its card follows
// the delegation from proposed through review, with the checks the
// specialist ran, every file it changed with the reviewer's admission, and a
// diff per file. "Ask about this" steers through the front role, by putting
// a reference to the delegation or the change in the composer; "Open in IDE"
// shows the changes in Theia.
import type { DataMessagePartComponent } from '@assistant-ui/react'
import { MultiFileDiff, PatchDiff } from '@pierre/diffs/react'
import { useTheme } from 'next-themes'
import type { FC, ReactNode } from 'react'
import { useState } from 'react'
import {
  CollapsibleContent,
  CollapsibleRoot,
  CollapsibleTrigger,
} from '@/components/assistant-ui/elements/collapsible-root'
import {
  liveEnter,
  ShimmerLabel,
} from '@/components/assistant-ui/elements/surfaces'
import { askAbout } from '@/components/chat/composer-references'
import { useOpenChanges } from '@/components/ide/follow'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { withoutCode } from '@/lib/theorem/client'
import {
  LIVE_DELEGATION_STATES,
  changeSide,
  plainObjective,
  readDelegation,
  readIntent,
  readReview,
  useDelegationContent,
  useDelegationDock,
  useLiveDelegation,
} from '@/lib/theorem/delegations'
import type {
  ChangeAdmission,
  ChangeSetEntry,
  DelegationPart,
  ReceiptCheck,
  ReviewVerdict,
} from '@/lib/theorem/delegations'
import { cn } from '@/lib/utils'

const card =
  'my-3 flex w-full max-w-2xl flex-col rounded-artifact border border-separator bg-artifact'

const STATE_LABELS: Record<DelegationPart['state'], string> = {
  proposed: 'Proposed',
  admitted: 'Queued',
  started: 'Working',
  published: 'Ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
  stale: 'Stale',
  reviewed: 'Reviewed',
  refused: 'Refused',
}

export const VERDICT_LABELS: Record<ReviewVerdict, string> = {
  accept: 'Accepted',
  reject: 'Rejected',
  correct: 'Corrected',
  request_verification: 'Verification requested',
  request_clarification: 'Clarification requested',
  revise_intent: 'Intent revised',
  close_incomplete: 'Closed incomplete',
}

const ADMISSION_LABELS: Record<ChangeAdmission['state'], string> = {
  pending: 'Pending review',
  admitted: 'Admitted',
  conflict: 'Conflict',
  out_of_scope: 'Out of scope',
  refused: 'Not applied',
  direct: 'Direct',
}

/** Admitted and direct changes are the normal case; only the rest earn a chip. */
const quietAdmission = (admission: ChangeAdmission) =>
  admission.state === 'admitted' || admission.state === 'direct'

const CHECK_LABELS: Record<ReceiptCheck['status'], string> = {
  passed: 'passed',
  failed: 'failed',
  not_run: 'not run',
  timed_out: 'timed out',
}

const troubled = (admission: ChangeAdmission) =>
  admission.state === 'conflict' ||
  admission.state === 'refused' ||
  admission.state === 'out_of_scope'

/** The model id without its provider route: "minimax-m3" for "openrouter/minimax/minimax-m3". */
const modelName = (model: string) => model.split('/').at(-1) ?? model

function cost(microunits: number | undefined) {
  if (microunits === undefined) return undefined
  const dollars = microunits / 1_000_000
  return dollars < 0.01 ? `<$0.01` : `$${dollars.toFixed(2)}`
}

const Section: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <section className="flex flex-col gap-1.5 border-t border-separator px-4 py-3">
    <h4 className="text-xs font-semibold text-ink-faint">{title}</h4>
    {children}
  </section>
)

/* ---------------------------------------------------------------- the diff */

const DIFF_THEME = {
  dark: 'github-dark-default',
  light: 'github-light-default',
}

/**
 * A git-style patch, which Pierre's parser reads as an add, a modify or a
 * delete of one path. Theorem stores a plain unified diff.
 */
function gitPatch(patch: string, { path, change }: ChangeSetEntry) {
  if (patch.startsWith('diff --git')) return patch
  const body = patch.replace(/^--- .*\n\+\+\+ .*\n/, '')
  const mode =
    change === 'add'
      ? 'new file mode 100644\n'
      : change === 'delete'
        ? 'deleted file mode 100644\n'
        : ''
  const before = change === 'add' ? '/dev/null' : `a/${path}`
  const after = change === 'delete' ? '/dev/null' : `b/${path}`
  return `diff --git a/${path} b/${path}\n${mode}--- ${before}\n+++ ${after}\n${body}`
}

const ChangeDiff: FC<{
  delegation: DelegationPart
  change: ChangeSetEntry
}> = ({ delegation, change }) => {
  const { resolvedTheme } = useTheme()
  const { parentRunId: runId, delegationId } = delegation
  const patch = useDelegationContent(runId, delegationId, change.diffRef)
  // Without a stored diff, Pierre diffs the two sides itself.
  const sides = !change.diffRef && !change.binary
  const before = useDelegationContent(
    runId,
    delegationId,
    sides ? change.beforeRef : undefined,
  )
  const after = useDelegationContent(
    runId,
    delegationId,
    sides ? change.afterRef : undefined,
  )
  if (change.binary)
    return <p className="px-4 py-3 text-xs text-ink-faint">Binary file.</p>
  const queries = change.diffRef ? [patch] : [before, after]
  const failed = queries.find((q) => q.isError)
  if (failed)
    return (
      <p role="alert" className="px-4 py-3 text-xs text-error-ink">
        {failed.error instanceof Error
          ? failed.error.message
          : 'Loading the change failed.'}
      </p>
    )
  if (queries.some((q) => q.isPending && q.fetchStatus !== 'idle'))
    return (
      <ShimmerLabel className="block px-4 py-3 text-xs text-ink-faint">
        Loading the diff
      </ShimmerLabel>
    )
  const options = {
    theme: DIFF_THEME,
    themeType:
      resolvedTheme === 'dark' ? ('dark' as const) : ('light' as const),
    diffStyle: 'unified' as const,
    disableFileHeader: true,
    overflow: 'scroll' as const,
  }
  return (
    <div className="max-h-96 overflow-auto border-t border-separator text-xs">
      {patch.data !== undefined ? (
        <PatchDiff patch={gitPatch(patch.data, change)} options={options} />
      ) : (
        <MultiFileDiff
          oldFile={{ name: change.path, contents: before.data ?? '' }}
          newFile={{ name: change.path, contents: after.data ?? '' }}
          options={options}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------- changed files */

const ChangeRow: FC<{ delegation: DelegationPart; change: ChangeSetEntry }> = ({
  delegation,
  change,
}) => {
  const openChanges = useOpenChanges()
  const [open, setOpen] = useState(false)
  const { admission } = change
  const detail =
    admission.state === 'conflict' || admission.state === 'refused'
      ? admission.detail
      : undefined
  return (
    <CollapsibleRoot
      open={open}
      onOpenChange={setOpen}
      className="border-t border-separator first:border-t-0"
    >
      <div className="flex items-center gap-2 px-4 py-1.5">
        <CollapsibleTrigger
          className="flex min-w-0 flex-1 items-center gap-2 text-start text-sm hover:text-ink"
          aria-label={`${open ? 'Hide' : 'Show'} the diff of ${change.path}`}
        >
          <Icon.Next
            className={cn(
              'size-3 shrink-0 text-ink-faint transition-transform duration-100',
              open && 'rotate-90',
            )}
          />
          <span
            className={cn(
              'min-w-0 truncate font-mono text-xs',
              change.change === 'delete' && 'line-through',
            )}
            title={change.path}
          >
            {change.path}
          </span>
          {change.change === 'add' && (
            <span className="shrink-0 text-xs text-ink-faint">new</span>
          )}
          {(change.linesAdded !== undefined ||
            change.linesRemoved !== undefined) && (
            <span className="shrink-0 font-mono text-xs">
              <span className="text-teal-ink">+{change.linesAdded ?? 0}</span>{' '}
              <span className="text-error-ink">
                −{change.linesRemoved ?? 0}
              </span>
            </span>
          )}
        </CollapsibleTrigger>
        {!quietAdmission(admission) && (
          <span
            title={detail}
            className={cn(
              'shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-medium',
              troubled(admission)
                ? 'bg-error-container text-error-ink'
                : 'text-ink-faint',
            )}
          >
            {ADMISSION_LABELS[admission.state]}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Ask about ${change.path}`}
          className="p-1.5"
          onClick={() =>
            askAbout({
              label: change.path,
              location: {
                resource: {
                  kind: 'delegation-change',
                  runId: delegation.parentRunId,
                  delegationId: delegation.delegationId,
                  path: change.path,
                  side: changeSide(change),
                },
              },
            })
          }
        >
          <Icon.Chat className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Open ${change.path} in the IDE`}
          className="p-1.5"
          onClick={() =>
            openChanges({
              runId: delegation.parentRunId,
              delegationId: delegation.delegationId,
              path: change.path,
            })
          }
        >
          <Icon.Ide className="size-3.5" />
        </Button>
      </div>
      {detail && (
        <p className="px-4 pb-1.5 ps-9 text-xs text-error-ink">{detail}</p>
      )}
      <CollapsibleContent>
        <ChangeDiff delegation={delegation} change={change} />
      </CollapsibleContent>
    </CollapsibleRoot>
  )
}

/* ------------------------------------------------------------ the receipt */

const CheckOutput: FC<{ delegation: DelegationPart; outputRef: string }> = ({
  delegation,
  outputRef,
}) => {
  const output = useDelegationContent(
    delegation.parentRunId,
    delegation.delegationId,
    outputRef,
  )
  if (output.isError)
    return (
      <p role="alert" className="text-xs text-error-ink">
        {output.error.message}
      </p>
    )
  if (output.data === undefined)
    return (
      <ShimmerLabel className="block text-xs text-ink-faint">
        Loading the output
      </ShimmerLabel>
    )
  return (
    <pre className="max-h-72 overflow-auto rounded-md bg-raised p-2 font-mono text-xs leading-5 whitespace-pre-wrap">
      {output.data || 'No output.'}
    </pre>
  )
}

/** The checks the specialist ran; with `delegation`, each one's output opens below it. */
const CheckList: FC<{
  checks: ReceiptCheck[]
  delegation?: DelegationPart
}> = ({ checks, delegation }) => (
  <ul className="flex flex-col gap-1">
    {checks.map((check) => {
      const passed = check.status === 'passed'
      const StatusIcon = passed ? Icon.Check : Icon.Close
      const row = (
        <>
          <StatusIcon
            className={cn(
              'size-3.5 shrink-0',
              passed
                ? 'text-ink-muted'
                : check.status === 'not_run'
                  ? 'text-ink-faint'
                  : 'text-error-ink',
            )}
          />
          <code
            className="min-w-0 truncate font-mono"
            title={check.argv.join(' ')}
          >
            {check.argv.join(' ')}
          </code>
          <span
            className={cn(
              'shrink-0',
              passed || check.status === 'not_run'
                ? 'text-ink-faint'
                : 'text-error-ink',
            )}
          >
            {CHECK_LABELS[check.status]}
            {check.exitCode !== undefined &&
              check.status === 'failed' &&
              ` (exit ${check.exitCode})`}
          </span>
        </>
      )
      if (!delegation || !check.outputRef)
        return (
          <li key={check.checkId} className="flex items-center gap-2 text-xs">
            {row}
          </li>
        )
      return (
        <li key={check.checkId}>
          <CollapsibleRoot>
            <CollapsibleTrigger className="flex w-full items-center gap-2 text-start text-xs hover:text-ink">
              {row}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1.5 pb-1">
              <CheckOutput
                delegation={delegation}
                outputRef={check.outputRef}
              />
            </CollapsibleContent>
          </CollapsibleRoot>
        </li>
      )
    })}
  </ul>
)

const Notes: FC<{ title: string; items: string[] }> = ({ title, items }) =>
  items.length ? (
    <Section title={title}>
      <ul className="ms-4 list-disc text-sm leading-6">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </Section>
  ) : null

function workProblems({ receipt, problem }: DelegationPart): string[] {
  const terminal = receipt?.terminal
  const workerFailure = terminal?.kind === 'failed' ? terminal.message : undefined
  return [
    workerFailure && withoutCode(workerFailure),
    problem && problem !== workerFailure
      ? `Follow-up failed: ${withoutCode(problem)}`
      : undefined,
  ].filter((message): message is string => Boolean(message))
}

/**
 * A delegation's record: the card in the conversation, and in `detailed`
 * form the dock panel, which adds each check's output and the assumptions.
 */
export const DelegationBody: FC<{
  delegation: DelegationPart
  detailed?: boolean
}> = ({ delegation, detailed = false }) => {
  const openChanges = useOpenChanges()
  const openDetails = useDelegationDock((s) => s.open)
  const { receipt, state } = delegation
  const live = LIVE_DELEGATION_STATES.has(state)
  const status =
    state === 'reviewed' && delegation.verdict
      ? VERDICT_LABELS[delegation.verdict]
      : STATE_LABELS[state]
  const bad =
    state === 'failed' ||
    state === 'refused' ||
    state === 'stale' ||
    delegation.verdict === 'reject'
  const usage = receipt?.usage
  // Counts are int64 on the wire, so they may arrive as bigint.
  const tokens =
    usage &&
    Number(usage.promptTokens ?? 0) +
      Number(usage.completionTokens ?? 0) +
      Number(usage.reasoningTokens ?? 0)
  const changes = receipt?.changes ?? []
  const reported = receipt?.reported
  const objective = plainObjective(delegation.objective)
  // A criterion that only restates the objective says nothing new.
  const criteria = delegation.criteria.filter(
    (criterion) => plainObjective(criterion) !== objective,
  )
  const target = {
    runId: delegation.parentRunId,
    delegationId: delegation.delegationId,
  }

  return (
    <>
      <header className="flex items-start gap-3 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-muted">
          <Icon.Delegate
            className={cn(
              'size-5',
              live && 'animate-float motion-reduce:animate-none',
            )}
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex min-w-0 items-baseline gap-2 text-sm">
            <span className="truncate font-medium">{delegation.roleLabel}</span>
            {detailed && (
              <span className="truncate font-mono text-xs text-ink-faint">
                {modelName(delegation.model)}
              </span>
            )}
          </p>
          <p
            className={cn('text-sm text-ink-muted', !detailed && 'line-clamp-3')}
            title={detailed ? undefined : objective}
          >
            {objective}
          </p>
        </div>
        {live ? (
          <ShimmerLabel className="shrink-0 text-xs text-ink-faint">
            {status}
          </ShimmerLabel>
        ) : (
          <span
            className={cn(
              'shrink-0 text-xs font-medium',
              bad ? 'text-error-ink' : 'text-ink-muted',
            )}
          >
            {status}
          </span>
        )}
      </header>

      {workProblems(delegation).map((problem) => (
        <p
          key={problem}
          role="alert"
          className="mx-4 mb-3 rounded-lg bg-error-container px-3 py-2 text-sm text-error-ink"
        >
          {problem}
        </p>
      ))}

      {reported?.summary && (
        <Section title="Report">
          <p className="text-sm leading-6 whitespace-pre-wrap">
            {reported.summary}
          </p>
        </Section>
      )}

      {criteria.length > 0 && (
        <Section title="Criteria">
          {reported ? (
            <ul className="flex flex-col gap-1 text-sm">
              {criteria.map((criterion, index) => {
                const met = reported.completedCriteria.includes(criterion)
                return (
                  <li key={index} className="flex items-start gap-2">
                    {met ? (
                      <Icon.Check className="mt-0.5 size-3.5 shrink-0 text-ink-muted" />
                    ) : (
                      <span className="mt-1 size-3 shrink-0 rounded-full border border-ink-faint/50" />
                    )}
                    <span className={cn(!met && 'text-ink-muted')}>
                      {plainObjective(criterion)}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            // Nothing is met or missed before the specialist reports.
            <ul className="ms-4 list-disc text-sm leading-6">
              {criteria.map((criterion, index) => (
                <li key={index}>{plainObjective(criterion)}</li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {receipt && receipt.checks.length > 0 && (
        <Section title="Checks">
          <CheckList
            checks={receipt.checks}
            delegation={detailed ? delegation : undefined}
          />
        </Section>
      )}

      {changes.length > 0 && (
        <section className="border-t border-separator">
          <h4 className="px-4 pt-3 pb-1 text-xs font-semibold text-ink-faint">
            {changes.length === 1
              ? '1 file changed'
              : `${changes.length} files changed`}
          </h4>
          <div className="pb-1">
            {changes.map((change) => (
              <ChangeRow
                key={change.path}
                delegation={delegation}
                change={change}
              />
            ))}
          </div>
        </section>
      )}

      {reported && (
        <>
          <Notes
            title="Skipped"
            items={reported.skipped.map((s) => `${s.requirement}: ${s.reason}`)}
          />
          <Notes title="Deviations" items={reported.deviations} />
          {detailed && (
            <Notes title="Assumptions" items={reported.assumptions} />
          )}
          <Notes title="Open questions" items={reported.unresolved} />
        </>
      )}

      <footer className="flex items-center gap-1 border-t border-separator px-2 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() =>
            askAbout({
              label: `${delegation.roleLabel}: ${objective}`,
              location: { resource: { kind: 'delegation', ...target } },
            })
          }
        >
          <Icon.Chat className="size-3.5" />
          Ask about this
        </Button>
        {changes.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => openChanges(target)}
          >
            <Icon.Ide className="size-3.5" />
            Open in IDE
          </Button>
        )}
        {!detailed && openDetails && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() =>
              openDetails(delegation.delegationId, delegation.roleLabel)
            }
          >
            <Icon.Expand className="size-3.5" />
            Details
          </Button>
        )}
        {detailed && (
          <span className="ms-auto truncate px-2 text-xs text-ink-faint">
            {[
              receipt && `${receipt.commandCount} commands`,
              tokens ? `${tokens.toLocaleString()} tokens` : undefined,
              cost(
                usage?.costMicrounits === undefined
                  ? undefined
                  : Number(usage.costMicrounits),
              ),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </footer>
    </>
  )
}

const DelegationCard: DataMessagePartComponent = ({ data }) => {
  const delegation = useLiveDelegation(readDelegation(data))
  if (!delegation) return null
  return (
    <article
      data-slot="theorem-delegation-card"
      data-delegation-id={delegation.delegationId}
      className={cn(card, liveEnter)}
    >
      <DelegationBody delegation={delegation} />
    </article>
  )
}

/* -------------------------------------------------------- review and intent */

const OUTCOME_LABELS = {
  accepted: 'Intent accepted',
  remains_open: 'Intent remains open',
  closed_incomplete: 'Closed incomplete',
} as const

const ReviewCard: DataMessagePartComponent = ({ data }) => {
  const review = readReview(data)
  if (!review) return null
  const troubledAdmissions = review.admissions.filter((a) =>
    troubled(a.admission),
  )
  return (
    <CollapsibleRoot
      data-slot="theorem-review-card"
      className={cn(card, liveEnter)}
    >
      <CollapsibleTrigger className="flex items-center gap-3 p-4 text-start">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-muted">
          <Icon.Eye className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">
            {OUTCOME_LABELS[review.intentOutcome]}
          </span>
          <span className="line-clamp-2 text-sm text-ink-muted">
            {review.summary}
          </span>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {review.verdicts.length > 0 && (
          <Section title="Verdicts">
            <ul className="flex flex-col gap-1.5 text-sm">
              {review.verdicts.map((v) => (
                <li key={v.delegationId}>
                  {v.roleLabel && <span>{v.roleLabel}: </span>}
                  <span
                    className={cn(
                      'font-medium',
                      v.verdict === 'reject' && 'text-error-ink',
                    )}
                  >
                    {VERDICT_LABELS[v.verdict]}
                  </span>
                  {v.rationale && (
                    <span className="text-ink-muted"> · {v.rationale}</span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {troubledAdmissions.length > 0 && (
          <Section title="Not admitted">
            <ul className="flex flex-col gap-1 text-xs">
              {troubledAdmissions.map((a) => (
                <li key={`${a.delegationId}:${a.path}`} className="flex gap-2">
                  <code className="min-w-0 truncate font-mono">{a.path}</code>
                  <span className="shrink-0 text-error-ink">
                    {ADMISSION_LABELS[a.admission.state]}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </CollapsibleContent>
    </CollapsibleRoot>
  )
}

const INTENT_STATUS = {
  open: 'Open',
  accepted: 'Accepted',
  superseded: 'Superseded',
  closed_incomplete: 'Closed incomplete',
} as const

const IntentCard: DataMessagePartComponent = ({ data }) => {
  const intent = readIntent(data)
  if (!intent) return null
  return (
    <CollapsibleRoot
      data-slot="theorem-intent-card"
      className={cn(
        card,
        liveEnter,
        intent.status === 'superseded' && 'opacity-70',
      )}
    >
      <CollapsibleTrigger className="flex items-center gap-3 p-4 text-start">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-muted">
          <Icon.Draft className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs text-ink-faint">
            {intent.revision > 1 ? 'Revised goal' : 'Goal'}
          </span>
          <span className="line-clamp-2 text-sm font-medium">
            {intent.goal}
          </span>
        </span>
        <span className="shrink-0 text-xs text-ink-muted">
          {INTENT_STATUS[intent.status]}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {intent.successCriteria.length > 0 && (
          <Section title="Success criteria">
            <ul className="ms-4 list-disc text-sm leading-6">
              {intent.successCriteria.map((c) => (
                <li key={c.id}>{c.text}</li>
              ))}
            </ul>
          </Section>
        )}
        {intent.nonGoals.length > 0 && (
          <Section title="Not in scope">
            <ul className="ms-4 list-disc text-sm leading-6">
              {intent.nonGoals.map((g) => (
                <li key={g.id}>
                  {g.text}
                  {g.protectedPaths.length > 0 && (
                    <span className="font-mono text-xs text-ink-faint">
                      {' '}
                      ({g.protectedPaths.join(', ')})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}
        <Notes title="Constraints" items={intent.constraints} />
      </CollapsibleContent>
    </CollapsibleRoot>
  )
}

export const DELEGATION_RENDERERS: Array<[string, DataMessagePartComponent]> = [
  ['theorem-delegation', DelegationCard],
  ['theorem-review', ReviewCard],
  ['theorem-intent', IntentCard],
]
