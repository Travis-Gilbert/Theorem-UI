// SOURCING: @assistant-ui/react data renderers (useAssistantDataUI + dataRenderers.setFallbackDataUI), @tanstack/react-router CatchBoundary per part and the installed ToolFallback / ApprovalCard / ThinkingIndicator / Reasoning elements, ui/button for the artifact card actions
//
// Theorem message parts that are not text or tool calls arrive as data parts
// named `theorem-<type>` (see @theoremharness/sdk/assistant-ui). This file
// renders them per the theorem-chat-v1 contract, renders Theorem's tool
// approvals (decided through runs.command, since Theorem owns approvals), and
// gives the artifact tools a pending card while they run.
import { useAui, useAuiState, useAssistantDataUI } from '@assistant-ui/react'
import { CatchBoundary } from '@tanstack/react-router'
import type {
  DataMessagePartComponent,
  ToolCallMessagePartComponent,
  ToolCallMessagePartProps,
} from '@assistant-ui/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FC } from 'react'
import { ApprovalCard } from '@/components/assistant-ui/elements/approval-card'
import type { ApprovalState } from '@/components/assistant-ui/elements/approval-card'
import {
  CollapsibleContent,
  CollapsibleRoot,
  CollapsibleTrigger,
} from '@/components/assistant-ui/elements/collapsible-root'
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
  kindLabel,
  readArtifact,
  useThreadArtifacts,
} from '@/components/artifacts/artifact-model'
import { download } from '@/components/artifacts/artifact-panel'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import { follow } from '@/components/ide/follow'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { describeError, mutate, theorem } from '@/lib/theorem/client'
import { liveEnter } from '@/components/assistant-ui/elements/surfaces'
import { recordLaunch } from '@/lib/motion'
import { cn } from '@/lib/utils'

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
  const artifacts = useThreadArtifacts()
  const { open } = useArtifactView.getState()
  const selected = useArtifactView(
    (s) => s.openId !== undefined && s.openId === artifact?.artifactId,
  )
  const live = useAuiState((s) => s.message.status?.type === 'running')
  const artifactId = artifact?.artifactId
  const revision = artifact?.revision
  const cardRef = useRef<HTMLDivElement>(null)
  // The panel an artifact opens in flies out of this card.
  const launch = () => {
    if (cardRef.current && artifactId)
      recordLaunch(
        cardRef.current.getBoundingClientRect(),
        `artifact:${artifactId}`,
      )
  }

  // A revision produced by the run in progress opens beside the conversation,
  // unless the person paused Follow the Agent.
  useEffect(() => {
    if (!live || !artifactId) return
    if (cardRef.current)
      recordLaunch(
        cardRef.current.getBoundingClientRect(),
        `artifact:${artifactId}`,
      )
    follow({ resource: { kind: 'artifact', artifactId, revision } })
  }, [live, artifactId, revision])

  if (!artifact)
    return <PartNotice name="theorem-artifact" note="could not be read" />
  const versions = artifacts.get(artifact.artifactId) ?? [artifact]
  const position = versions.findIndex((v) => v.revision === artifact.revision)
  const latest = position === versions.length - 1
  const show = () => {
    launch()
    open(artifact.artifactId, latest ? undefined : artifact.revision)
  }

  return (
    <div
      ref={cardRef}
      data-slot="theorem-artifact-card"
      data-artifact-id={artifact.artifactId}
      data-selected={selected || undefined}
      className={cn(
        'my-3 flex w-full max-w-md items-center gap-3 rounded-artifact border border-separator bg-artifact p-4',
        'transition-colors duration-100',
        selected && 'bg-selected outline outline-1 outline-redwood-ink',
      )}
    >
      <button
        type="button"
        onClick={show}
        className="flex min-w-0 flex-1 items-center gap-3 text-start"
        aria-label={`Open ${artifact.title}`}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-muted">
          <Icon.Artifact className="size-5 animate-float motion-reduce:animate-none" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span
            className={cn(
              'truncate text-sm',
              selected ? 'font-semibold' : 'font-medium',
            )}
          >
            {artifact.title}
          </span>
          <span className="truncate text-xs text-ink-faint">
            {kindLabel(artifact)}
            {versions.length > 1 && ` · v${position + 1}`}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open"
          className="group/open size-8 p-1.5"
          onClick={show}
        >
          <Icon.Open className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Download"
          className="size-8 p-1.5"
          onClick={() => download(artifact)}
        >
          <Icon.Download className="size-4" />
        </Button>
      </div>
    </div>
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
      <span className="font-mono">{name}</span>
      {failed && ' · failed'}
      {state === 'pending' && !running && ' · did not finish'}
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
  options: Array<{ optionId: string; name: string; kind: string }>
}

export function readApproval(
  interrupt: ToolCallMessagePartProps['interrupt'],
): TheoremApproval | undefined {
  if (interrupt?.type !== 'human') return undefined
  const part = object(interrupt.payload)
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
    options,
  }
}

/** Pending Theorem approvals render standalone so they are never folded into a tool group. */
export function isStandaloneToolCall(part: {
  type: string
  toolName?: string
  interrupt?: unknown
}) {
  if (part.type !== 'tool-call') return false
  if (part.toolName && ARTIFACT_TOOLS.has(part.toolName)) return true
  const approval = readApproval(
    part.interrupt as ToolCallMessagePartProps['interrupt'],
  )
  return approval !== undefined && approval.approved === undefined
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

  const decide = async (
    option: { optionId?: string; decision?: 'allow' | 'deny' },
    granted: boolean,
  ) => {
    if (!runId) {
      setError('This approval belongs to a run that is no longer live.')
      return
    }
    setError(undefined)
    setState(granted ? 'running' : 'denied')
    try {
      await mutate((headers) =>
        theorem().chat.runs.command({
          runId,
          command: 'approval',
          approvalId: approval.approvalId,
          toolCallId: approval.toolCallId,
          ...option,
          ...headers,
        }),
      )
    } catch (failure) {
      setState('request')
      setError(describeError(failure))
    }
  }

  const byKind = (kind: string) => approval.options.find((o) => o.kind === kind)
  const allowOnce = byKind('allow_once')
  const allowAlways = byKind('allow_always')
  const reject = byKind('reject_once') ?? byKind('reject_always')
  const offered = approval.options.length > 0

  return (
    <div className="my-3 flex flex-col gap-2">
      <ApprovalCard
        state={state}
        title={approval.summary}
        subtitle={`${approval.toolName} · risk: ${approval.risk.replace(/_/g, ' ')}`}
        command={argsText || undefined}
        icon={<Icon.Settings className="size-4" />}
        className="max-w-md rounded-artifact border-separator bg-artifact"
        onAllowOnce={
          !offered
            ? () => decide({ decision: 'allow' }, true)
            : allowOnce
              ? () => decide({ optionId: allowOnce.optionId }, true)
              : undefined
        }
        allowOnceLabel={allowOnce?.name ?? 'Allow once'}
        onAlwaysAllow={
          allowAlways
            ? () => decide({ optionId: allowAlways.optionId }, true)
            : undefined
        }
        alwaysAllowLabel={allowAlways?.name ?? 'Always allow'}
        onDeny={
          !offered
            ? () => decide({ decision: 'deny' }, false)
            : reject
              ? () => decide({ optionId: reject.optionId }, false)
              : undefined
        }
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

/** ToolFallback slot: artifact tools, Theorem approvals, then the generic tool card. */
export const TheoremToolCall: ToolCallMessagePartComponent = (props) => {
  if (ARTIFACT_TOOLS.has(props.toolName)) return <ArtifactToolCall {...props} />
  const approval = readApproval(props.interrupt)
  if (approval && props.result === undefined)
    return <TheoremApprovalCard approval={approval} argsText={props.argsText} />
  return <ToolFallback {...props} />
}

/* ------------------------------------------------------------ progress strip */

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

/**
 * Theorem publishes answer text at turn end, so a running turn needs a visible
 * state: the latest progress label, or "Thinking", beside a thinking orb.
 */
export const RunningIndicator: FC = () => {
  const running = useAuiState((s) => s.message.status?.type === 'running')
  const awaiting = useAuiState((s) =>
    s.message.content.some(
      (part) =>
        part.type === 'tool-call' &&
        part.result === undefined &&
        readApproval(part.interrupt)?.approved === undefined &&
        readApproval(part.interrupt) !== undefined,
    ),
  )
  const label = useAuiState((s) => {
    const last = s.message.content.findLast(
      (part) => part.type === 'data' && part.name === 'theorem-progress',
    )
    const data = last?.type === 'data' ? object(last.data) : {}
    return LIVE_STATUSES.has(str(data.status) ?? '')
      ? str(data.label)
      : undefined
  })
  if (!running) return null
  return (
    <ThinkingIndicator
      className="my-2"
      label={awaiting ? 'Waiting for your approval' : (label ?? 'Thinking')}
      orb={awaiting ? 'breathing' : 'working'}
    />
  )
}

/** One strip per message summarizing the run's progress steps, shown once the turn settles. */
const ProgressPart: DataMessagePartComponent = ({ data }) => {
  const settled = useAuiState((s) => s.message.status?.type !== 'running')
  // Select the store's own content array; deriving inside the selector would
  // hand back a fresh array on every read and loop the subscription.
  const content = useAuiState((s) => s.message.content)
  const labels = useMemo(() => progressLabels(content), [content])
  const isLast = useAuiState((s) => {
    const last = s.message.content.findLast(
      (part) => part.type === 'data' && part.name === 'theorem-progress',
    )
    return last?.type === 'data' && last.data === data
  })
  // Labels are what the run was doing while live ("Working"), even on the
  // step that completes, so the strip names the outcome from the statuses: the
  // message's, then the last step's.
  const outcome = useAuiState((s) =>
    s.message.status?.type !== 'incomplete'
      ? undefined
      : s.message.status.reason === 'cancelled'
        ? 'Stopped'
        : 'Did not finish',
  )
  const finished = DONE_STATUSES.has(str(object(data).status) ?? 'complete')
  if (!settled || !isLast || labels.length === 0) return null
  const result = outcome ?? (finished ? 'Done' : 'Did not finish')
  const StatusIcon = result === 'Done' ? Icon.Check : Icon.Close
  return (
    <CollapsibleRoot className="my-1 text-sm text-ink-faint">
      <CollapsibleTrigger className="flex items-center gap-1.5 py-1 hover:text-ink">
        <StatusIcon className="size-3.5" />
        {labels.length > 1
          ? `${result} ${result === 'Done' ? 'in' : 'after'} ${labels.length} steps`
          : result}
      </CollapsibleTrigger>
      {labels.length > 1 && (
        <CollapsibleContent>
          <ol className="ms-5 list-decimal py-1 text-sm leading-6">
            {labels.map((label, index) => (
              <li key={index}>{label}</li>
            ))}
          </ol>
        </CollapsibleContent>
      )}
    </CollapsibleRoot>
  )
}

/* ------------------------------------------------------------- other parts */

const ReasoningSummaryPart: DataMessagePartComponent = ({ data }) => {
  const text = str(object(data).text)
  const running = useAuiState((s) => s.message.status?.type === 'running')
  if (!text) return null
  return (
    <ReasoningRoot streaming={running}>
      <ReasoningTrigger active={running} />
      <ReasoningContent>
        <ReasoningText>
          <p className="whitespace-pre-wrap">{text}</p>
        </ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  )
}

const CitationPart: DataMessagePartComponent = ({ data }) => {
  const part = object(data)
  const provenance = object(part.provenance)
  const label = str(part.label) ?? str(part.sourceId) ?? 'Source'
  const url = str(provenance.url)
  const excerpt = str(provenance.excerpt)
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
      title={excerpt ?? url}
      className={cn(chip, 'hover:text-ink')}
    >
      {content}
    </a>
  ) : (
    <span title={excerpt} className={chip}>
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
      <p className="font-medium">
        {str(part.message) ?? 'The run reported an error.'}
      </p>
      <p className="mt-0.5 font-mono text-xs opacity-80">
        {str(part.code) ?? 'error'}
        {part.recoverable === true && ' · use Refresh to try again'}
      </p>
    </div>
  )
}

const AttachmentPart: DataMessagePartComponent = ({ data }) => {
  const part = object(data)
  return (
    <span className="me-1.5 mt-2 inline-flex items-center gap-1.5 rounded-md border border-separator bg-raised px-2 py-1 text-xs text-ink-muted">
      <Icon.Attachment className="size-3" />
      {str(part.name) ?? 'Attachment'}
      {str(part.state) &&
        str(part.state) !== 'ready' &&
        ` · ${str(part.state)}`}
    </span>
  )
}

/** Inspector-only or figure-only parts: retained inert, never drawn in the transcript. */
const Inert: DataMessagePartComponent = () => null

/** Named placeholder for a part this client cannot draw. */
const PartNotice: FC<{ name: string; note: string }> = ({ name, note }) => (
  <p className="my-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-separator px-2 py-1 font-mono text-xs text-ink-faint">
    {name.replace(/^theorem-/, '')} part · {note}
  </p>
)

const FallbackPart: DataMessagePartComponent = ({ name }) => (
  <PartNotice name={name} note="not rendered by Theorem UI yet" />
)

/** Keeps a part that throws inside its own slot instead of unmounting the chat. */
function guarded(
  name: string,
  Render: DataMessagePartComponent,
): DataMessagePartComponent {
  const errorComponent = () => (
    <PartNotice name={name} note="could not be rendered" />
  )
  return (props) => (
    <CatchBoundary
      getResetKey={() => props.data}
      errorComponent={errorComponent}
    >
      <Render {...props} />
    </CatchBoundary>
  )
}

const RENDERERS = (
  [
    [ARTIFACT_PART, ArtifactPart],
    ['theorem-progress', ProgressPart],
    ['theorem-reasoning_summary', ReasoningSummaryPart],
    ['theorem-citation', CitationPart],
    ['theorem-error', ErrorPart],
    ['theorem-attachment', AttachmentPart],
    ['theorem-host_call', HostCallPart],
  ] satisfies Array<[string, DataMessagePartComponent]>
)
  .map(([name, render]): [string, DataMessagePartComponent] => [
    name,
    guarded(name, render),
  ])
  .concat([
    ['theorem-usage', Inert],
    ['theorem-expression', Inert],
    ['theorem-expression_refused', Inert],
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
