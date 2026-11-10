// SOURCING: @assistant-ui/react data renderers (useAssistantDataUI + dataRenderers.setFallbackDataUI), @tanstack/react-router CatchBoundary per part, coss ui Collapsible (base-ui) for the activity line's details, and the installed ToolFallback / ApprovalCard / ThinkingIndicator / Reasoning elements, ui/button for the artifact card actions, scene-part.tsx for the theorem-scene part
//
// Theorem message parts that are not text or tool calls arrive as data parts
// named `theorem-<type>` (see @theoremharness/sdk/assistant-ui). This file
// renders them per the theorem-chat-v1 contract, renders Theorem's tool
// approvals (decided through runs.command, since Theorem owns approvals), and
// gives the artifact tools a pending card while they run. Delegated work has
// its own cards in delegation-parts.
import { useAui, useAuiState, useAssistantDataUI } from '@assistant-ui/react'
import { CatchBoundary } from '@tanstack/react-router'
import type {
  AssistantState,
  DataMessagePartComponent,
  ToolCallMessagePartComponent,
} from '@assistant-ui/react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { ApprovalCard } from '@/components/assistant-ui/elements/approval-card'
import type { ApprovalState } from '@/components/assistant-ui/elements/approval-card'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/coss/collapsible'
import {
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from '@/components/assistant-ui/elements/reasoning'
import { ThinkingIndicator } from '@/components/assistant-ui/elements/thinking-indicator'
import { ToolFallback } from '@/components/assistant-ui/elements/tool-fallback.aui'
import {
  ARTIFACT_PART,
  readArtifact,
} from '@/components/artifacts/artifact-model'
import { ArtifactMessage } from '@/components/artifacts/artifact-message'
import { DELEGATION_RENDERERS } from '@/components/chat/delegation-parts'
import { NoteImage } from '@/components/notes/kinds/embed-block'
import { ReviewAnswerCard } from '@/components/review/review-card'
import { PlanToolCall } from '@/components/chat/plan-graph'
import { askAbout } from '@/components/chat/composer-references'
import {
  readScene,
  repairRequest,
  SCENE_PART,
} from '@/components/chat/scene-model'
import { SceneCard } from '@/components/chat/scene-part'
import { useSceneTheme } from '@/components/chat/scene-theme'
import { Icon } from '@/components/icons'
import {
  describeError,
  describeRunFailure,
  mutate,
  theorem,
} from '@/lib/theorem/client'
import { uploadContentPath } from '@/lib/theorem/uploads'
import { DRAFT_PLAN } from '@/lib/theorem/plans'
import { liveEnter } from '@/components/assistant-ui/elements/surfaces'
import { cn, humanize } from '@/lib/utils'

type Json = Record<string, unknown>

function object(value: unknown): Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : {}
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/* ------------------------------------------------------------------ artifacts */

const ArtifactPart: DataMessagePartComponent = ({ data }) => {
  const artifact = readArtifact(data)
  return artifact ? (
    <ArtifactMessage
      key={`${artifact.artifactId}:${artifact.rendererId}:${artifact.documentId ?? ''}`}
      artifact={artifact}
    />
  ) : (
    <PartNotice name="theorem-artifact" />
  )
}

/** Stand-in card while an artifact tool runs; the artifact part replaces it. */
const ArtifactPendingCard: FC<{
  toolName: string
  title?: string
}> = ({ toolName, title }) => (
  <div className="my-3 flex w-full max-w-md items-center gap-3 rounded-artifact border border-separator bg-artifact p-4">
    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-muted">
      <Icon.Artifact className="size-5 animate-float motion-reduce:animate-none" />
    </span>
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-medium">
        {title ?? 'Untitled artifact'}
      </span>
      <span className="shimmer text-xs text-ink-faint motion-reduce:animate-none">
        {toolName === 'update_artifact' ? 'Revising' : 'Writing'}
      </span>
    </span>
  </div>
)

const ArtifactToolFailed: FC<{ toolName: string }> = ({ toolName }) => (
  <p className="my-2 text-sm text-error-ink">
    {toolName === 'update_artifact' ? 'Updating' : 'Creating'} the artifact
    failed.
  </p>
)

/** create_artifact / update_artifact as tool-call parts. */
const ArtifactToolCall: ToolCallMessagePartComponent<{
  title?: string
  kind?: string
}> = ({ toolName, args, result, isError, status }) => {
  if (isError) return <ArtifactToolFailed toolName={toolName} />
  if (result !== undefined || status.type !== 'running') return null
  return <ArtifactPendingCard toolName={toolName} title={str(args.title)} />
}

const ARTIFACT_TOOLS = new Set(['create_artifact', 'update_artifact'])

/**
 * A host function called by the native agent's program. Artifact calls defer
 * to the artifact card, which carries their result; the rest show as a chip.
 */
const HostCallPart: DataMessagePartComponent = ({ data }) => {
  const call = object(data)
  const name = str(call.name) ?? 'host call'
  const state = str(call.state) ?? 'pending'
  const running = useAuiState((s) => s.message.status?.type === 'running')
  // The agent retries a failed artifact call; once one lands, the miss is noise.
  const produced = useAuiState((s) =>
    s.message.content.some(
      (part) => part.type === 'data' && part.name === ARTIFACT_PART,
    ),
  )
  const pending = state === 'pending' && running
  if (ARTIFACT_TOOLS.has(name)) {
    if (pending) return <ArtifactPendingCard toolName={name} />
    if (state === 'failed' && !produced)
      return <ArtifactToolFailed toolName={name} />
    return null
  }
  const failed = state === 'failed'
  const StateIcon = pending ? Icon.Code : failed ? Icon.Close : Icon.Check
  return (
    <span
      className={cn(
        'me-1.5 mt-2 inline-flex items-center gap-1.5 rounded-md border border-separator bg-raised px-2 py-1 align-top text-xs font-semibold',
        liveEnter,
        failed ? 'text-error-ink' : 'text-ink-muted',
      )}
    >
      <StateIcon
        className={cn(
          'size-3 shrink-0',
          // Each state is its own icon, so the settled one pops in.
          pending
            ? 'animate-pulse motion-reduce:animate-none'
            : 'in-data-live:animate-in in-data-live:fade-in in-data-live:zoom-in-30 in-data-live:-spin-in-45',
        )}
      />
      <span>{humanize(name)}</span>
      {failed && ' · failed'}
      {state === 'pending' && !running && ' · did not finish'}
    </span>
  )
}

/**
 * A check the agent asked this page to make of an App: that it is being
 * made, and what it found. Kit's operations draw nothing here; the fox on
 * the stage shows what they did.
 */
/**
 * What the chip for an `app.check` request says, or null for any other
 * operation. `wrong` is anything short of a check that was made and found
 * nothing: a type check that could not be made found nothing either, and says
 * so with its `reason`.
 */
export function appCheckSummary(
  data: unknown,
  running: boolean,
): { words: string; pending: boolean; wrong: boolean; reason?: string } | null {
  const call = object(data)
  if (str(call.operation) !== 'app.check') return null
  const state = str(call.state) ?? 'pending'
  const receipt = object(call.receipt)
  const result = object(receipt.result)
  const problems = Array.isArray(result.problems) ? result.problems.length : 0
  const found =
    problems + (typeof result.omitted === 'number' ? result.omitted : 0)
  const pending = state === 'pending' && running
  const checked = state === 'answered' && str(receipt.outcome) === 'applied'
  const reason = checked ? str(result.typeCheckError) : undefined
  const wrong = !pending && (!checked || found > 0 || reason !== undefined)
  const words = pending
    ? 'Checking the App'
    : !checked
      ? 'The App was not checked'
      : result.built === false
        ? 'The App does not build'
        : found > 0
          ? `Checked the App: ${found === 1 ? '1 problem' : `${found} problems`}`
          : reason !== undefined
            ? 'Checked the App: its types could not be checked'
            : 'Checked the App: no problems'
  return { words, pending, wrong, reason }
}

const ClientOperationPart: DataMessagePartComponent = ({ data }) => {
  const running = useAuiState((s) => s.message.status?.type === 'running')
  const summary = appCheckSummary(data, running)
  if (!summary) return null
  const { words, pending, wrong, reason } = summary
  const StateIcon = pending ? Icon.Code : wrong ? Icon.Close : Icon.Check
  return (
    <span
      data-slot="app-check"
      title={reason}
      className={cn(
        'me-1.5 mt-2 inline-flex items-center gap-1.5 rounded-md border border-separator bg-raised px-2 py-1 align-top text-xs font-semibold',
        liveEnter,
        wrong ? 'text-error-ink' : 'text-ink-muted',
      )}
    >
      <StateIcon
        className={cn(
          'size-3 shrink-0',
          pending && 'animate-pulse motion-reduce:animate-none',
        )}
      />
      <span>{words}</span>
    </span>
  )
}

/* ------------------------------------------------------------------ approvals */

export type TheoremApproval = {
  approvalId: string
  toolCallId: string
  toolName: string
  summary: string
  risk: string
  status: string
  approved: boolean | undefined
  /** The host's words for an approval that settled unanswered: expired or replaced. */
  reason: string | undefined
  options: Array<{ optionId: string; name: string; kind: string }>
}

/** What became of an approval, as `ApprovalPart::outcome` in theorem-surface-contracts collapses it. */
export type ApprovalOutcome =
  'awaiting' | 'approved' | 'declined' | 'failed' | 'unanswered'

const AWAITING_STATUSES = new Set(['requires_action', 'pending', 'open'])

/**
 * An approval is awaited only while its status says so. An expired or
 * replaced request settles `incomplete` with `approved` still unset, so an
 * unset decision alone is not a question anyone can answer.
 */
export function approvalOutcome(
  approval: Pick<TheoremApproval, 'status' | 'approved'>,
): ApprovalOutcome {
  if (AWAITING_STATUSES.has(approval.status)) return 'awaiting'
  if (approval.approved === true) return 'approved'
  if (approval.approved === false) return 'declined'
  return approval.status === 'failed' ? 'failed' : 'unanswered'
}

/**
 * The approval a tool call carries, settled or not. The SDK keeps the latest
 * `tool_approval` snapshot on the part's `artifact.theoremApproval` and sets
 * its human `interrupt` only while the approval awaits a decision, so an
 * answered, expired or replaced approval is read here without holding the
 * message in requires-action.
 */
export function readApproval(toolCall: {
  readonly artifact?: unknown
}): TheoremApproval | undefined {
  const part = object(object(toolCall.artifact).theoremApproval)
  const approvalId = str(part.approvalId)
  const toolCallId = str(part.toolCallId)
  if (!approvalId || !toolCallId) return undefined
  const options = Array.isArray(part.options)
    ? part.options.map(object).flatMap((o) =>
        str(o.optionId) && str(o.kind)
          ? [
              {
                optionId: o.optionId as string,
                name: str(o.name) ?? (o.kind as string),
                kind: o.kind as string,
              },
            ]
          : [],
      )
    : []
  return {
    approvalId,
    toolCallId,
    toolName: str(part.toolName) ?? 'tool',
    summary:
      str(part.summary) ?? `Allow ${str(part.toolName) ?? 'this tool'} to run?`,
    risk: str(part.risk) ?? 'unknown',
    status: str(part.status) ?? 'pending',
    approved: typeof part.approved === 'boolean' ? part.approved : undefined,
    reason: str(part.reason),
    options,
  }
}

type ApprovalChoice = { optionId: string } | { decision: 'allow' | 'deny' }

/** The tool, and its risk when Theorem marks it above low. */
function approvalSubtitle({ toolName, risk }: TheoremApproval) {
  const elevated = risk === 'medium' || risk === 'high'
  return elevated ? `${humanize(toolName)} · ${risk} risk` : humanize(toolName)
}

/** What a plain allow or deny sends: allow once, or reject; a bare decision when the approval offers no options. */
export function approvalChoice(
  options: TheoremApproval['options'],
  allow: boolean,
): ApprovalChoice | undefined {
  if (!options.length) return { decision: allow ? 'allow' : 'deny' }
  const byKind = (kind: string) => options.find((o) => o.kind === kind)
  const option = allow
    ? byKind('allow_once')
    : (byKind('reject_once') ?? byKind('reject_always'))
  return option && { optionId: option.optionId }
}

/** Sends a decision to the run that asked for the approval. */
export function sendApprovalDecision(
  runId: string,
  approval: Pick<TheoremApproval, 'approvalId' | 'toolCallId'>,
  choice: ApprovalChoice,
) {
  return mutate((headers) =>
    theorem().chat.runs.command({
      runId,
      command: 'approval',
      approvalId: approval.approvalId,
      toolCallId: approval.toolCallId,
      ...choice,
      ...headers,
    }),
  )
}

/** Pending Theorem approvals, artifacts and plans render standalone so they are never folded into a tool group. */
export function isStandaloneToolCall(part: {
  type: string
  toolName?: string
  artifact?: unknown
}) {
  if (part.type !== 'tool-call') return false
  if (
    part.toolName &&
    (ARTIFACT_TOOLS.has(part.toolName) || part.toolName === DRAFT_PLAN)
  )
    return true
  const approval = readApproval(part)
  return approval !== undefined && approvalOutcome(approval) === 'awaiting'
}

const TheoremApprovalCard: FC<{
  approval: TheoremApproval
  argsText: string
}> = ({ approval, argsText }) => {
  const runId = useAuiState((s) => {
    const custom = object(s.message.metadata.custom)
    return str(custom.theoremRunId)
  })
  const [state, setState] = useState<ApprovalState>(
    approval.approved === undefined
      ? 'request'
      : approval.approved
        ? 'done'
        : 'denied',
  )
  const [error, setError] = useState<string>()
  // The part can settle while the card is open; a request nobody answered
  // offers no buttons, and the host's reason says why.
  const outcome = approvalOutcome(approval)
  const unanswered = outcome === 'unanswered' || outcome === 'failed'

  const decide = async (choice: ApprovalChoice, granted: boolean) => {
    if (!runId) {
      setError('This approval belongs to a run that is no longer live.')
      return
    }
    setError(undefined)
    setState(granted ? 'running' : 'denied')
    try {
      await sendApprovalDecision(runId, approval, choice)
    } catch (failure) {
      setState('request')
      setError(describeError(failure))
    }
  }

  const byKind = (kind: string) => approval.options.find((o) => o.kind === kind)
  const allowOnce = byKind('allow_once')
  const allowAlways = byKind('allow_always')
  const reject = byKind('reject_once') ?? byKind('reject_always')
  const allow = approvalChoice(approval.options, true)
  const deny = approvalChoice(approval.options, false)

  return (
    <div className="my-3 flex flex-col gap-2">
      <ApprovalCard
        state={unanswered ? 'denied' : state}
        statusLabel={
          unanswered
            ? (approval.reason ??
              (outcome === 'failed' ? 'The request failed' : 'Not answered'))
            : undefined
        }
        title={approval.summary}
        subtitle={approvalSubtitle(approval)}
        command={argsText || undefined}
        icon={<Icon.Settings className="size-4" />}
        className="max-w-md rounded-artifact border-separator bg-artifact"
        onAllowOnce={allow && (() => decide(allow, true))}
        allowOnceLabel={allowOnce?.name ?? 'Allow once'}
        onAlwaysAllow={
          allowAlways
            ? () => decide({ optionId: allowAlways.optionId }, true)
            : undefined
        }
        alwaysAllowLabel={allowAlways?.name ?? 'Always allow'}
        onDeny={deny && (() => decide(deny, false))}
        denyLabel={reject?.name ?? 'Deny'}
      />
      {error && (
        <p role="alert" className="text-sm text-error-ink">
          {error}
        </p>
      )}
    </div>
  )
}

/** ToolFallback slot: artifact tools, plans, Theorem approvals, then the generic tool card. */
export const TheoremToolCall: ToolCallMessagePartComponent = (props) => {
  if (ARTIFACT_TOOLS.has(props.toolName)) return <ArtifactToolCall {...props} />
  if (props.toolName === DRAFT_PLAN) return <PlanToolCall {...props} />
  const approval = readApproval(props)
  if (approval && props.result === undefined)
    return <TheoremApprovalCard approval={approval} argsText={props.argsText} />
  return <ToolFallback {...props} />
}

/* ---------------------------------------------------------------- activity */

const LIVE_STATUSES = new Set([
  'running',
  'active',
  'pending',
  'started',
  'in_progress',
])

const DONE_STATUSES = new Set([
  'complete',
  'completed',
  'done',
  'succeeded',
  'success',
])

function progressLabels(
  content: readonly { type: string; name?: string; data?: unknown }[],
) {
  return content.flatMap((part) => {
    if (part.type !== 'data' || part.name !== 'theorem-progress') return []
    const label = str(object(part.data).label)
    return label ? [label] : []
  })
}

/** How long the person waited for this reply: from their message to its arrival. */
const waitedSeconds = (s: AssistantState) => {
  const { messages } = s.thread
  const at = messages.findIndex((message) => message.id === s.message.id)
  const asked = messages
    .slice(0, Math.max(at, 0))
    .findLast((message) => message.role === 'user')
  const replied = messages[at]
  if (!asked || !replied) return undefined
  return Math.round(
    (replied.createdAt.getTime() - asked.createdAt.getTime()) / 1000,
  )
}

const spokenSeconds = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`

const ACTIVITY_CONTROL =
  '-mx-1 cursor-pointer rounded-sm px-1 outline-offset-2 outline-focus transition-colors duration-(--duration-snap) ease-snap hover:bg-hover hover:text-ink focus-visible:outline-2 data-panel-open:bg-hover data-panel-open:text-ink'

/**
 * What the agent is doing, then what it did, as one unboxed line by its name:
 * the live step while it works ("Theorem · Checking the examples"), and once
 * it settles how long the reply took and a Details control ("Theorem · 42s ·
 * Details"). Theorem publishes answer text at turn end, so the live step is
 * the running turn's visible state. Either opens the steps, the reasoning and
 * the tool calls on a small sheet of paper; until then the work takes no room
 * of its own. A run that stopped or did not finish says so on the line, and an
 * approval still to give keeps its card in the reply.
 */
export const Activity: FC<{
  /** Whose line this is. A specialist's run in a delegation panel has no name to sit by. */
  speaker?: string | undefined
  /** The reply's reasoning and tool calls as the thread draws them, when it has any. */
  work?: ReactNode
}> = ({ speaker, work }) => {
  const running = useAuiState((s) => s.message.status?.type === 'running')
  const awaiting = useAuiState((s) =>
    s.message.content.some((part) => {
      if (part.type !== 'tool-call' || part.result !== undefined) return false
      const approval = readApproval(part)
      return approval !== undefined && approvalOutcome(approval) === 'awaiting'
    }),
  )
  // Select the store's own content array; deriving inside the selector would
  // hand back a fresh array on every read and loop the subscription.
  const content = useAuiState((s) => s.message.content)
  const labels = useMemo(() => progressLabels(content), [content])
  const progress = useMemo(() => {
    const last = content.findLast(
      (part) => part.type === 'data' && part.name === 'theorem-progress',
    )
    return last?.type === 'data' ? object(last.data) : {}
  }, [content])
  const status = str(progress.status)
  // Labels are what the run was doing while live ("Working"), even on the
  // step that completes, so the line names the outcome from the statuses: the
  // message's, then the last step's.
  const outcome = useAuiState((s) =>
    s.message.status?.type === 'complete'
      ? 'Done'
      : s.message.status?.type === 'incomplete'
        ? s.message.status.reason === 'cancelled'
          ? 'Stopped'
          : 'Did not finish'
        : undefined,
  )
  const seconds = useAuiState(waitedSeconds)
  const [open, setOpen] = useState(false)

  const steps = labels.length > 1
  const openable = steps || Boolean(work)
  const notes: ReactNode[] = []
  if (running) {
    const doing = (
      <ThinkingIndicator
        label={
          awaiting
            ? 'Waiting for your approval'
            : ((LIVE_STATUSES.has(status ?? '')
                ? str(progress.label)
                : undefined) ?? 'Thinking')
        }
        orb={awaiting ? 'breathing' : 'working'}
      />
    )
    notes.push(
      openable ? (
        <CollapsibleTrigger
          nativeButton={false}
          render={doing}
          className={ACTIVITY_CONTROL}
        />
      ) : (
        doing
      ),
    )
  } else if (labels.length > 0 || work) {
    const result =
      outcome ??
      (DONE_STATUSES.has(status ?? 'complete') ? 'Done' : 'Did not finish')
    if (result !== 'Done') notes.push(result)
    if (seconds)
      notes.push(<span className="tabular-nums">{spokenSeconds(seconds)}</span>)
    if (openable)
      notes.push(
        <CollapsibleTrigger className={ACTIVITY_CONTROL}>
          Details
        </CollapsibleTrigger>,
      )
  }
  if (!speaker && notes.length === 0) return null

  return (
    <Collapsible
      data-slot="activity"
      className="mb-1.5"
      open={open}
      onOpenChange={setOpen}
    >
      <div className="flex min-h-6 flex-wrap items-center gap-x-2 px-2">
        {speaker && <span className="font-medium text-ink">{speaker}</span>}
        {notes.length > 0 && (
          <span
            data-slot="activity-line"
            className="flex min-w-0 items-center gap-x-2 text-sm text-ink-muted"
          >
            {notes.map((note, index) => (
              <Fragment key={index}>
                {(speaker || index > 0) && (
                  <span aria-hidden className="text-ink-faint">
                    ·
                  </span>
                )}
                {note}
              </Fragment>
            ))}
          </span>
        )}
      </div>
      {openable && (
        <CollapsiblePanel>
          {/* Room for the sheet's shadow inside the panel's clip. */}
          <div className="px-2 pt-2 pb-3">
            <div
              data-slot="activity-details"
              className="surface-paper-subtle rounded-xl px-3 py-2 text-sm"
            >
              {steps && (
                <ol className="ms-5 list-decimal py-1 leading-6 text-ink-muted">
                  {labels.map((label, index) => (
                    <li key={index}>{label}</li>
                  ))}
                </ol>
              )}
              {work}
            </div>
          </div>
        </CollapsiblePanel>
      )}
    </Collapsible>
  )
}

/* ------------------------------------------------------------- other parts */

const ReasoningSummaryPart: DataMessagePartComponent = ({ data }) => {
  const text = str(object(data).text)
  const running = useAuiState((s) => s.message.status?.type === 'running')
  if (!text) return null
  return (
    <ReasoningRoot streaming={running} variant="ghost" className="mb-1">
      <ReasoningTrigger active={running} />
      <ReasoningContent>
        <ReasoningText>
          <p className="whitespace-pre-wrap">{text}</p>
        </ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  )
}

/** External evidence links must name an absolute web URL; never infer a destination. */
function citationUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

/**
 * Sources a web search or page read retrieved. Each result arrived as its own
 * citation and drew a tag, eight to a search, crowding the answer; the answer
 * links what it uses and the tool call keeps every result, so these draw none.
 */
const RETRIEVED_SOURCES = new Set<unknown>(['web_search', 'web_read'])

const CitationPart: DataMessagePartComponent = ({ data }) => {
  const part = object(data)
  if (RETRIEVED_SOURCES.has(part.sourceKind)) return null
  const provenance = object(part.provenance)
  const url = citationUrl(provenance.url)
  const label = str(part.label) ?? (url && new URL(url).hostname) ?? 'Source'
  const title = str(provenance.excerpt) ?? url
  const chip =
    'me-1.5 mt-2 inline-flex max-w-64 items-center gap-1.5 rounded-md border border-separator bg-raised px-2 py-1 align-top text-xs text-ink-muted'
  const content = (
    <>
      <Icon.Link className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </>
  )
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={cn(chip, 'hover:text-ink')}
    >
      {content}
    </a>
  ) : (
    <span title={title} className={chip}>
      {content}
    </span>
  )
}

const ErrorPart: DataMessagePartComponent = ({ data }) => {
  const part = object(data)
  return (
    <div
      role="alert"
      className="my-3 max-w-md rounded-lg bg-error-container px-4 py-3 text-sm text-error-ink"
    >
      <p className="font-medium">{describeRunFailure(part)}</p>
    </div>
  )
}

/** Upload states worth a word; a ready attachment needs none. */
const ATTACHMENT_STATES: Partial<Record<string, string>> = {
  pending: 'uploading',
  uploading: 'uploading',
  failed: 'failed',
  refused: 'refused',
}

const AttachmentPart: DataMessagePartComponent = ({ data }) => {
  const part = object(data)
  const uploadId = str(part.uploadId)
  if (uploadId && str(part.mediaType)?.startsWith('image/'))
    return (
      <NoteImage
        src={uploadContentPath(uploadId)}
        alt={str(part.name) ?? 'Attachment'}
        className="me-1.5 mt-2 inline-block max-h-40 rounded-md border border-separator"
      />
    )
  return (
    <span className="me-1.5 mt-2 inline-flex items-center gap-1.5 rounded-md border border-separator bg-raised px-2 py-1 text-xs text-ink-muted">
      <Icon.Attachment className="size-3" />
      {str(part.name) ?? 'Attachment'}
      {ATTACHMENT_STATES[str(part.state) ?? 'ready'] &&
        ` · ${ATTACHMENT_STATES[str(part.state) ?? 'ready']}`}
    </span>
  )
}

/** Where a run did not take what the person sent while it worked. */
const INPUT_REFUSALS: Record<string, string> = {
  run_ended: 'the run ended first',
  run_cancelled: 'the run was stopped',
  run_input_unsupported: 'this run takes no input',
  answer_final: 'its answer was already final',
  report_captured: 'its answer was already final',
}

/**
 * What the person sent while the run worked, drawn where the run took it in;
 * dim with its state until it did.
 */
const UserInputPart: DataMessagePartComponent = ({ data }) => {
  const part = object(data)
  const text = str(part.text)
  if (!text) return null
  const status = str(part.status)
  const reason = str(part.reason)
  const note =
    status === 'delivered'
      ? undefined
      : status === 'not_delivered'
        ? `not delivered${reason && INPUT_REFUSALS[reason] ? `: ${INPUT_REFUSALS[reason]}` : ''}`
        : 'queued for its next step'
  return (
    <p
      data-slot="theorem-user-input"
      data-status={status}
      className={`my-2 border-s-2 border-separator ps-3 text-sm whitespace-pre-wrap ${status === 'delivered' ? 'text-ink' : 'text-ink-muted'}`}
    >
      {text}
      {note && <span className="ms-2 text-xs text-ink-faint">· {note}</span>}
    </p>
  )
}

/* --------------------------------------------------------------------- scenes */

/**
 * A reply's interactive scene (scene-part.tsx), drawn above its text. Fix
 * sends the failure to the agent as the next turn; a pick becomes a
 * reference to this reply, with what was picked as its excerpt.
 */
const ScenePart: DataMessagePartComponent = ({ data }) => {
  const aui = useAui()
  const theme = useSceneTheme()
  const threadId = useAuiState((s) => s.threadListItem.remoteId)
  const messageId = useAuiState((s) => s.message.id)
  const scene = readScene(data)
  if (!scene) return <PartNotice name={SCENE_PART} />
  return (
    <SceneCard
      scene={scene}
      theme={theme}
      onRepair={(error) => aui.thread.append(repairRequest(scene.title, error))}
      onAsk={
        threadId
          ? (entity) =>
              askAbout({
                label: `${scene.title ?? 'Scene'}: ${entity.label ?? entity.id}`,
                excerpt: JSON.stringify({
                  scene: { sceneId: scene.sceneId, title: scene.title },
                  entity,
                }),
                location: {
                  resource: { kind: 'message', threadId, messageId },
                },
              })
          : undefined
      }
    />
  )
}

/** Inspector-only or figure-only parts: retained inert, never drawn in the transcript. */
const Inert: DataMessagePartComponent = () => null

/** Placeholder for a part this client cannot draw; the part's name stays in the DOM for debugging. */
const PartNotice: FC<{ name: string }> = ({ name }) => (
  <p
    data-part={name}
    className="my-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-separator px-2 py-1 text-xs text-ink-faint"
  >
    This content can't be shown here.
  </p>
)

const FallbackPart: DataMessagePartComponent = ({ name }) => (
  <PartNotice name={name} />
)

/** Keeps a part that throws inside its own slot instead of unmounting the chat. */
function guarded(
  name: string,
  Render: DataMessagePartComponent,
): DataMessagePartComponent {
  const errorComponent = () => <PartNotice name={name} />
  return (props) => (
    <CatchBoundary
      getResetKey={() => props.data}
      errorComponent={errorComponent}
    >
      <Render {...props} />
    </CatchBoundary>
  )
}

/** The answer's message carries which review it answered, so its card can reopen it. */
const ReviewAnswerPart: DataMessagePartComponent = ({ data }) => {
  const reviewId = str(object(data).reviewId)
  return reviewId ? <ReviewAnswerCard reviewId={reviewId} /> : null
}

const RENDERERS = (
  [
    [ARTIFACT_PART, ArtifactPart],
    [SCENE_PART, ScenePart],
    ['theorem-review_answer', ReviewAnswerPart],
    ['theorem-reasoning_summary', ReasoningSummaryPart],
    ['theorem-citation', CitationPart],
    ['theorem-error', ErrorPart],
    ['theorem-attachment', AttachmentPart],
    ['theorem-host_call', HostCallPart],
    ['theorem-user_input', UserInputPart],
    ...DELEGATION_RENDERERS,
  ] satisfies Array<[string, DataMessagePartComponent]>
)
  .map(([name, render]): [string, DataMessagePartComponent] => [
    name,
    guarded(name, render),
  ])
  .concat([
    // The run's steps are drawn once per message by Activity.
    ['theorem-progress', Inert],
    ['theorem-usage', Inert],
    ['theorem-expression', Inert],
    ['theorem-expression_refused', Inert],
    // The page's client operations: a check of an App shows as a chip.
    ['theorem-client_operation', ClientOperationPart],
    // The native agent's program: what it does shows up as its host calls
    // and their artifacts, and its stored source is not the full program.
    ['theorem-program', Inert],
  ])

function DataRenderer({
  name,
  render,
}: {
  name: string
  render: DataMessagePartComponent
}) {
  useAssistantDataUI({ name, render })
  return null
}

/** Mount once inside the runtime provider. */
export function TheoremPartRenderers() {
  const aui = useAui()
  useEffect(() => aui.dataRenderers.setFallbackDataUI(FallbackPart), [aui])
  return (
    <>
      {RENDERERS.map(([name, render]) => (
        <DataRenderer key={name} name={name} render={render} />
      ))}
    </>
  )
}
