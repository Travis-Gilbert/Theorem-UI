// SOURCING: @tanstack/react-query via lib/theorem/observe (one turn's trace, re-read while it runs), @tanstack/react-router Link (back to the conversation), the settings frame (SettingsPage, SettingsSection, SettingsBox). References studied on Mobbin for anatomy only: fal's request page (a phase strip over key and value rows), OpenAI Platform's trace rows.
import { Link } from '@tanstack/react-router'
import type { CSSProperties, ReactNode } from 'react'
import { buttonVariants } from '@/components/ui/button'
import {
  describeModel,
  describeStreamEnd,
  describeWaiting,
  formatSpan,
  layLanes,
  shortRunId,
  useRunReport,
} from '@/lib/theorem/observe'
import type {
  Lane,
  RunReport,
  RunTrace,
  TraceStep,
} from '@/lib/theorem/observe'
import { cn } from '@/lib/utils'
import { SettingsBox, SettingsPage, SettingsSection } from '../settings-frame'
import { Count, EmptyRow, Row, State } from './rows'
import type { Tone } from './rows'
import { Freshness, Outcome, ReadFailure, clock, num, td, th } from './parts'

export function RunPage({ runId }: { runId: string }) {
  const { data, error, isFetching, refetch } = useRunReport(runId)
  return (
    <SettingsPage
      title={`Turn ${shortRunId(runId)}`}
      description={data ? headline(data) : undefined}
      action={
        <>
          {data?.threadId && (
            <Link
              to="/c/$threadId"
              params={{ threadId: data.threadId }}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Open conversation
            </Link>
          )}
          <Freshness
            readAtMs={data?.generatedAtMs}
            reading={isFetching}
            paused={data?.terminal}
            onRead={() => void refetch()}
          />
        </>
      }
    >
      {error && (
        <ReadFailure
          error={error}
          stale={data?.generatedAtMs}
          onRetry={() => void refetch()}
        />
      )}
      {data ? (
        <Report data={data} />
      ) : (
        !error && (
          <p className="text-sm text-ink-muted">
            Reading the turn&rsquo;s record…
          </p>
        )
      )}
    </SettingsPage>
  )
}

/** The turn in a sentence: how it ended and how long it took, or what it waits for. */
function headline({ trace, live, generatedAtMs, terminal }: RunReport): string {
  const from = trace.admittedAtMs
  const took =
    from === null || from === undefined
      ? undefined
      : formatSpan((trace.endedAtMs ?? generatedAtMs) - from)
  if (terminal || trace.outcome) {
    const how =
      trace.outcome === 'failed'
        ? 'Failed'
        : trace.outcome === 'cancelled'
          ? 'Cancelled'
          : trace.outcome === 'completed'
            ? 'Completed'
            : 'Ended'
    return took ? `${how} after ${took}.` : `${how}.`
  }
  const waiting = live ? ` Waiting for: ${describeWaiting(live.waiting)}.` : ''
  return `${took ? `Running for ${took}.` : 'Running.'}${waiting}`
}

function Report({ data }: { data: RunReport }) {
  const { trace } = data
  const now = data.generatedAtMs
  return (
    <>
      <PhaseSection trace={trace} now={now} />
      <TurnSection data={data} />
      {trace.failure && <FailureSection failure={trace.failure} />}
      <LiveSection data={data} />
      <StepsSection trace={trace} now={now} ended={data.terminal} />
      <SettingsSection
        title="Not in this trace"
        description="A gap between steps is time the record does not account for. It is not evidence that nothing happened."
      >
        <SettingsBox>
          {trace.notRecorded.map((gap) => (
            <p key={gap} className="px-3 py-1.5 text-sm text-ink-muted">
              {gap}
            </p>
          ))}
        </SettingsBox>
      </SettingsSection>
    </>
  )
}

const PHASE: Record<string, { label: string; fill: string }> = {
  waiting_to_start: { label: 'Waiting to start', fill: 'bg-ink-faint' },
  before_first_output: { label: 'Before first output', fill: 'bg-ochre' },
  producing: { label: 'Producing', fill: 'bg-teal' },
}

function PhaseSection({ trace, now }: { trace: RunTrace; now: number }) {
  const phases = trace.phases.map((phase) => ({
    ...phase,
    ...(PHASE[phase.name] ?? { label: phase.name, fill: 'bg-ink-faint' }),
    span: Math.max((phase.endedAtMs ?? now) - phase.startedAtMs, 0),
    open: phase.endedAtMs === null || phase.endedAtMs === undefined,
  }))
  const total = phases.reduce((sum, phase) => sum + phase.span, 0)
  return (
    <SettingsSection
      title="Where the time went"
      description="From the moment the node admitted the turn to the event that ended it."
      action={total ? <Count>{formatSpan(total)}</Count> : undefined}
    >
      <SettingsBox>
        {phases.length === 0 || total === 0 ? (
          <EmptyRow>No times were recorded for this turn.</EmptyRow>
        ) : (
          <div className="flex flex-col gap-2.5 px-3 py-3">
            <div
              role="img"
              aria-label={phases
                .map((phase) => `${phase.label} ${formatSpan(phase.span)}`)
                .join(', ')}
              className="flex h-2 gap-px overflow-hidden rounded-full"
            >
              {phases.map((phase) => (
                <span
                  key={phase.name}
                  className={cn('min-w-0.5', phase.fill)}
                  style={{ flexGrow: phase.span, flexBasis: 0 }}
                />
              ))}
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {phases.map((phase) => (
                <div key={phase.name} className="flex items-baseline gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2 shrink-0 translate-y-[-0.5px] rounded-full',
                      phase.fill,
                    )}
                  />
                  <dt className="text-ink-muted">{phase.label}</dt>
                  <dd className="ms-auto tabular-nums">
                    {formatSpan(phase.span)}
                    {phase.open && (
                      <span className="text-ink-muted"> so far</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </SettingsBox>
    </SettingsSection>
  )
}

function TurnSection({ data }: { data: RunReport }) {
  const { trace } = data
  const model = describeModel(trace)
  const { usage } = trace
  return (
    <SettingsSection title="Turn">
      <SettingsBox>
        <Row label="Run">
          <span className="font-mono text-xs break-all select-all">
            {data.runId}
          </span>
        </Row>
        <Row label="State">
          {data.terminal || trace.outcome ? (
            <Outcome outcome={trace.outcome} />
          ) : (
            <State tone="attention">Running</State>
          )}
          <span className="text-ink-muted"> · recorded as {data.status}</span>
        </Row>
        <Row label="Admitted">
          <span className="tabular-nums">{clock(trace.admittedAtMs)}</span>
        </Row>
        <Row label="Model">
          {model ?? <span className="text-ink-muted">Not recorded</span>}
          {trace.regime && (
            <span className="text-ink-muted"> · {trace.regime}</span>
          )}
        </Row>
        <Row label="Tokens">
          {usage.reports ? (
            <span className="tabular-nums">
              {usage.inputTokens.toLocaleString()} in ·{' '}
              {usage.outputTokens.toLocaleString()} out
              <span className="text-ink-muted">
                {' '}
                · from {usage.reports}{' '}
                {usage.reports === 1 ? 'report' : 'reports'}
              </span>
            </span>
          ) : (
            <span className="text-ink-muted">Not reported</span>
          )}
        </Row>
        <Row label="Events read">
          <span className="tabular-nums">
            {trace.eventsRead.toLocaleString()}
          </span>
          {trace.skippedEvents > 0 && (
            <span className="text-ink-muted tabular-nums">
              {' '}
              · {trace.skippedEvents.toLocaleString()} in the middle of the turn
              were not read
            </span>
          )}
        </Row>
      </SettingsBox>
    </SettingsSection>
  )
}

function FailureSection({
  failure,
}: {
  failure: NonNullable<RunTrace['failure']>
}) {
  return (
    <SettingsSection title="Failure">
      <SettingsBox>
        <Row label="Code">
          <span className="font-mono text-xs">{failure.code}</span>
        </Row>
        <Row label="Message">{failure.message}</Row>
        {failure.correlationId && (
          <Row label="Reference">
            <span className="font-mono text-xs select-all">
              {failure.correlationId}
            </span>
          </Row>
        )}
      </SettingsBox>
    </SettingsSection>
  )
}

function LiveSection({ data }: { data: RunReport }) {
  const { live } = data
  return (
    <SettingsSection title="As this process saw it" description={data.liveNote}>
      {live && (
        <SettingsBox>
          {!data.terminal && (
            <Row label="Waiting for">{describeWaiting(live.waiting)}</Row>
          )}
          <Row label="Event streams">
            <span className="tabular-nums">{live.streamsOpened} opened</span>
            <span className="text-ink-muted">
              {' '}
              · {describeStreamEnd(live).toLowerCase()}
            </span>
          </Row>
          <Row label="Ending sent to a page">
            {live.terminalSent ? (
              <State tone="ok">Sent on an open stream</State>
            ) : data.terminal ? (
              <State tone="attention">No stream was open to send it on</State>
            ) : (
              <State tone="quiet" hollow>
                The turn has not ended
              </State>
            )}
            <p className="mt-0.5 text-ink-muted">
              Sent is not received: the node does not learn whether the page
              drew it.
            </p>
          </Row>
        </SettingsBox>
      )}
    </SettingsSection>
  )
}

const KIND: Record<string, string> = {
  admitted: 'Admitted',
  execution_started: 'Execution started',
  progress: 'Progress',
  tool_call: 'Tool',
  host_call: 'Host call',
  approval: 'Approval',
  text: 'Answer text',
  usage: 'Usage report',
  error: 'Error',
  ended: 'Ended',
  event: 'Event',
}

const STEP_STATE: Record<
  TraceStep['state'],
  { tone: Tone; label: string; fill: string }
> = {
  running: { tone: 'attention', label: 'Running', fill: 'bg-ochre' },
  waiting: { tone: 'attention', label: 'Waiting', fill: 'bg-ochre' },
  complete: { tone: 'ok', label: 'Complete', fill: 'bg-teal' },
  failed: { tone: 'bad', label: 'Failed', fill: 'bg-destructive' },
  denied: { tone: 'bad', label: 'Denied', fill: 'bg-destructive' },
  expired: { tone: 'quiet', label: 'Expired', fill: 'bg-ink-faint' },
  recorded: { tone: 'quiet', label: '', fill: 'bg-ink-faint' },
}

function stepState(item: TraceStep, ended: boolean): ReactNode {
  const { tone, label } = STEP_STATE[item.state]
  if (!label) return null
  // The turn's ending closed whatever was still open; it was not left hanging.
  if (ended && (item.state === 'running' || item.state === 'waiting'))
    return (
      <State tone="quiet" hollow>
        Open when the turn ended
      </State>
    )
  return <State tone={tone}>{label}</State>
}

function LaneBar({ lane, fill }: { lane: Lane | undefined; fill: string }) {
  if (!lane) return null
  const style: CSSProperties = {
    insetInlineStart: `${lane.left * 100}%`,
    width: lane.width ? `${lane.width * 100}%` : undefined,
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        'absolute top-1/2 h-1.5 min-w-0.5 -translate-y-1/2 rounded-full',
        fill,
        lane.open && 'rounded-e-none opacity-70',
      )}
    />
  )
}

function StepsSection({
  trace,
  now,
  ended,
}: {
  trace: RunTrace
  now: number
  ended: boolean
}) {
  const lanes = layLanes(trace, now)
  const from = trace.admittedAtMs
  const notes = [
    trace.droppedSteps > 0 &&
      `${trace.droppedSteps.toLocaleString()} further steps are not listed; a trace holds a bounded number.`,
    trace.truncated &&
      'This turn has more events than a trace reads at once, so its middle is missing here. The beginning and the ending are complete.',
  ].filter(Boolean)
  return (
    <SettingsSection
      title="Steps"
      description="In the order the turn recorded them. Names, states and times only: arguments, results and answer text are not part of a trace."
      action={
        trace.steps.length ? <Count>{trace.steps.length}</Count> : undefined
      }
    >
      <SettingsBox>
        {trace.steps.length === 0 ? (
          <EmptyRow>The turn recorded no steps.</EmptyRow>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-separator">
                  <th className={cn(th, num)}>At</th>
                  <th className={th}>Step</th>
                  <th className={th}>State</th>
                  <th className={cn(th, num)}>Took</th>
                  <th className={cn(th, 'w-[34%] min-w-40')}>
                    <span className="flex justify-between tabular-nums">
                      <span>0</span>
                      <span>
                        {from === null || from === undefined
                          ? ''
                          : formatSpan((trace.endedAtMs ?? now) - from)}
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-separator/60">
                {trace.steps.map((item) => {
                  const kind = KIND[item.kind] ?? item.kind
                  const named =
                    item.name !== item.kind &&
                    item.name.toLowerCase() !== kind.toLowerCase()
                  // A progress label is a sentence; the rest are identifiers.
                  const prose = item.kind === 'progress'
                  const took =
                    item.startedAtMs !== null &&
                    item.startedAtMs !== undefined &&
                    item.endedAtMs !== null &&
                    item.endedAtMs !== undefined
                      ? formatSpan(item.endedAtMs - item.startedAtMs)
                      : ''
                  return (
                    <tr key={item.seq}>
                      <td className={cn(td, num, 'text-ink-muted')}>
                        {from === null ||
                        from === undefined ||
                        item.startedAtMs === null ||
                        item.startedAtMs === undefined
                          ? '—'
                          : `+${formatSpan(item.startedAtMs - from)}`}
                      </td>
                      <td className={cn(td, 'max-w-80 truncate')}>
                        <span className={cn(named && 'text-ink-muted')}>
                          {kind}
                        </span>
                        {named && (
                          <span
                            className={cn(
                              'ms-1.5',
                              !prose && 'font-mono text-xs',
                            )}
                          >
                            {item.name}
                          </span>
                        )}
                        {item.detail && (
                          <span
                            className="ms-1.5 text-ink-muted"
                            title={item.detail}
                          >
                            {item.detail}
                          </span>
                        )}
                      </td>
                      <td className={td}>{stepState(item, ended)}</td>
                      <td className={cn(td, num)}>{took}</td>
                      <td className={td}>
                        <span className="relative block h-7">
                          <LaneBar
                            lane={lanes.get(item.seq)}
                            fill={STEP_STATE[item.state].fill}
                          />
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {notes.map((note) => (
          <p key={String(note)} className="px-3 py-1.5 text-sm text-ink-muted">
            {note}
          </p>
        ))}
      </SettingsBox>
    </SettingsSection>
  )
}
