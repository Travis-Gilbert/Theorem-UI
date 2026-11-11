// SOURCING: @tanstack/react-query via lib/theorem/observe (the node's overview, read again every few seconds), @tanstack/react-table v9 (the recent turns' columns and sorting), the settings page primitives. References studied on Mobbin for anatomy only: Snowflake's summary figures above a filtered table, OpenAI Platform's trace log rows.
import {
  createSortedRowModel,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import {
  describeStreamEnd,
  describeWaiting,
  formatSpan,
  useObserveOverview,
  waitsOnYou,
} from '@/lib/theorem/observe'
import type {
  ObserveAlert,
  ObserveOverview,
  ObservedRun,
} from '@/lib/theorem/observe'
import { cn } from '@/lib/utils'
import {
  EmptyRow,
  Row,
  RowGroup,
  Section,
  SettingsPage,
  State,
} from '../settings-page'
import type { Tone } from '../settings-page'
import {
  Freshness,
  Outcome,
  ReadFailure,
  TurnLink,
  clock,
  num,
  td,
  th,
} from './parts'

const TRAIL = [{ label: 'Workspace' }, { label: 'Observe' }]

export function ObservePage() {
  const { data, error, isFetching, refetch } = useObserveOverview()
  return (
    <SettingsPage
      wide
      trail={TRAIL}
      title="Observe"
      description="What this node saw of your turns: what is running and what it waits for, how recent turns went, and what the node cannot tell you."
      actions={
        <Freshness
          readAtMs={data?.generatedAtMs}
          reading={isFetching}
          onRead={() => void refetch()}
        />
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
        <Overview data={data} />
      ) : (
        !error && <p className="text-sm text-ink-muted">Reading the node…</p>
      )}
    </SettingsPage>
  )
}

function Overview({ data }: { data: ObserveOverview }) {
  const now = data.generatedAtMs
  return (
    <>
      <NodeSection data={data} />
      <AlertsSection alerts={data.alerts} />
      <TurnsSection data={data} />
      <RunningSection runs={data.active} now={now} />
      <RecentSection runs={data.recent} since={data.limits.observedSinceMs} />
      {data.nodeTotals && <TotalsSection totals={data.nodeTotals} />}
      <SignalsSection telemetry={data.telemetry} />
      <LimitsSection limits={data.limits} />
    </>
  )
}

function NodeSection({ data }: { data: ObserveOverview }) {
  const { node, generatedAtMs } = data
  const build = [node.version, node.gitSha?.slice(0, 7), node.profile]
    .filter(Boolean)
    .join(' · ')
  const builtAt = Number(node.builtAtUnix) * 1_000
  return (
    <Section title="Node">
      <RowGroup>
        <Row label="Serving">
          {node.status === 'ready' ? (
            <State tone="ok">Ready</State>
          ) : node.status === 'recovering' ? (
            <State tone="attention">
              Recovering{node.phase ? `: ${node.phase}` : ''}
            </State>
          ) : (
            <State tone="bad">
              Failed to start{node.detail ? `: ${node.detail}` : ''}
            </State>
          )}
        </Row>
        <Row label="Build">
          <span className="tabular-nums">{build}</span>
          {builtAt > 0 && (
            <span className="text-ink-muted"> · built {clock(builtAt)}</span>
          )}
        </Row>
        <Row label="Watching since">
          <span className="tabular-nums">{clock(node.observingSinceMs)}</span>
          <span className="text-ink-muted">
            {' '}
            · {formatSpan(generatedAtMs - node.observingSinceMs)} ago, when this
            process started
          </span>
        </Row>
      </RowGroup>
    </Section>
  )
}

const ALERT_ORDER: Record<ObserveAlert['state'], number> = {
  firing: 0,
  unavailable: 1,
  insufficient_data: 2,
  ok: 3,
}

function alertState(alert: ObserveAlert): ReactNode {
  switch (alert.state) {
    case 'firing':
      return (
        <State tone={alert.severity === 'critical' ? 'bad' : 'attention'}>
          Firing
        </State>
      )
    case 'ok':
      return <State tone="ok">Clear</State>
    case 'insufficient_data':
      return (
        <State tone="quiet" hollow>
          Too few turns to judge
        </State>
      )
    case 'unavailable':
      return (
        <State tone="quiet" hollow>
          Not judged
        </State>
      )
  }
}

function AlertsSection({ alerts }: { alerts: Array<ObserveAlert> }) {
  const firing = alerts.filter((alert) => alert.state === 'firing').length
  const ordered = [...alerts].sort(
    (a, b) => ALERT_ORDER[a.state] - ALERT_ORDER[b.state],
  )
  return (
    <Section
      title="Alerts"
      description="Each rule is judged when this page reads it. Nothing is sent anywhere when one fires."
      aside={firing ? `${firing} firing` : 'None firing'}
    >
      <RowGroup>
        {ordered.map((alert) => (
          <div key={alert.id} className="px-3 py-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5">
              <p className="font-medium">{alert.title}</p>
              <p className="flex items-baseline gap-3">
                <span className="text-xs text-ink-muted">
                  {alert.scope === 'node' ? 'Node' : 'Your turns'}
                </span>
                {alertState(alert)}
              </p>
            </div>
            <p className="mt-0.5 text-ink-muted">{alert.summary}</p>
            {alert.state === 'firing' && (
              <p className="mt-0.5">
                <span className="text-ink-muted">Next: </span>
                {alert.next}
              </p>
            )}
          </div>
        ))}
      </RowGroup>
    </Section>
  )
}

function Figure({
  label,
  value,
  children,
}: {
  label: string
  value: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-[22px] leading-tight tabular-nums">{value}</p>
      <p className="text-xs text-ink-muted tabular-nums">{children}</p>
    </div>
  )
}

function TurnsSection({ data }: { data: ObserveOverview }) {
  const { turns } = data
  const window = `${Math.round(turns.windowMs / 60_000)} min`
  const spread = (q: ObserveOverview['turns']['duration']) =>
    q.sample
      ? `95th percentile ${formatSpan(q.p95Ms)} · ${q.sample} ${q.sample === 1 ? 'turn' : 'turns'}`
      : `No turn ended in the last ${window}`
  return (
    <Section
      title="Your turns"
      description={`Figures for turns that ended in the last ${window}. A turn runs from the moment the node admits it to the event that ends it, whether or not a page is still listening.`}
    >
      <div className="grid grid-cols-2 divide-separator overflow-hidden rounded-lg border border-separator max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(odd)]:border-e lg:grid-cols-4 lg:divide-x">
        <Figure label="Running now" value={turns.active}>
          {turns.waitingOnYou
            ? `${turns.waitingOnYou} waiting on you`
            : 'None waiting on you'}
        </Figure>
        <Figure label={`Ended, last ${window}`} value={turns.ended}>
          {turns.ended
            ? `${turns.completed} completed · ${turns.failed} failed · ${turns.cancelled} cancelled`
            : 'None'}
        </Figure>
        <Figure
          label="To first output, median"
          value={formatSpan(turns.firstOutput.p50Ms)}
        >
          {spread(turns.firstOutput)}
        </Figure>
        <Figure
          label="Whole turn, median"
          value={formatSpan(turns.duration.p50Ms)}
        >
          {spread(turns.duration)}
        </Figure>
      </div>
    </Section>
  )
}

function tools(run: ObservedRun) {
  if (!run.operationsStarted) return '0'
  return run.operationsFailed
    ? `${run.operationsStarted} · ${run.operationsFailed} failed`
    : String(run.operationsStarted)
}

function RunningSection({
  runs,
  now,
}: {
  runs: Array<ObservedRun>
  now: number
}) {
  return (
    <Section
      title="Running now"
      description="What each turn in progress is waiting for, as the code that owns the wait reports it."
      aside={runs.length ? String(runs.length) : undefined}
    >
      <RowGroup>
        {runs.length === 0 ? (
          <EmptyRow>Nothing of yours is running.</EmptyRow>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-separator">
                  <th className={th}>Turn</th>
                  <th className={th}>Waiting for</th>
                  <th className={cn(th, num)}>For</th>
                  <th className={cn(th, num)}>Running</th>
                  <th className={cn(th, num)}>Tool calls</th>
                  <th className={th}>Event stream</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-separator/60">
                {runs.map((run) => {
                  const { waiting } = run
                  const since =
                    waiting.on === 'operation'
                      ? waiting.sinceMs
                      : (run.lastProgressAtMs ??
                        run.startedAtMs ??
                        run.admittedAtMs)
                  return (
                    <tr key={run.runId}>
                      <td className={td}>
                        <TurnLink runId={run.runId} />
                      </td>
                      <td className={td}>
                        <State
                          tone={waitsOnYou(waiting) ? 'attention' : 'quiet'}
                        >
                          {describeWaiting(waiting)}
                        </State>
                      </td>
                      <td className={cn(td, num)}>{formatSpan(now - since)}</td>
                      <td className={cn(td, num)}>
                        {formatSpan(now - run.admittedAtMs)}
                      </td>
                      <td className={cn(td, num)}>{tools(run)}</td>
                      <td className={td}>{describeStreamEnd(run)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </RowGroup>
    </Section>
  )
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic },
})

type Column = ColumnDef<typeof features, ObservedRun> & {
  meta?: { numeric?: boolean }
}

const span = (from: number, to: number | null | undefined) =>
  to === null || to === undefined ? undefined : to - from

const RECENT: Array<Column> = [
  {
    id: 'turn',
    header: 'Turn',
    accessorFn: (run) => run.runId,
    cell: ({ row }) => <TurnLink runId={row.original.runId} />,
    enableSorting: false,
  },
  {
    id: 'ended',
    header: 'Ended',
    accessorFn: (run) => run.endedAtMs ?? 0,
    cell: ({ row }) => clock(row.original.endedAtMs),
    sortFn: 'basic',
    meta: { numeric: true },
  },
  {
    id: 'outcome',
    header: 'Outcome',
    accessorFn: (run) => run.outcome ?? '',
    cell: ({ row }) => (
      <span title={row.original.failureCode ?? undefined}>
        <Outcome outcome={row.original.outcome} />
        {row.original.failureCode && (
          <span className="ms-2 font-mono text-xs text-ink-muted">
            {row.original.failureCode}
          </span>
        )}
      </span>
    ),
    enableSorting: false,
  },
  {
    id: 'duration',
    header: 'Whole turn',
    accessorFn: (run) => span(run.admittedAtMs, run.endedAtMs) ?? -1,
    cell: ({ row }) =>
      formatSpan(span(row.original.admittedAtMs, row.original.endedAtMs)),
    sortFn: 'basic',
    meta: { numeric: true },
  },
  {
    id: 'first',
    header: 'To first output',
    accessorFn: (run) => span(run.admittedAtMs, run.firstPartAtMs) ?? -1,
    cell: ({ row }) =>
      formatSpan(span(row.original.admittedAtMs, row.original.firstPartAtMs)),
    sortFn: 'basic',
    meta: { numeric: true },
  },
  {
    id: 'tools',
    header: 'Tool calls',
    accessorFn: (run) => run.operationsStarted,
    cell: ({ row }) => tools(row.original),
    sortFn: 'basic',
    meta: { numeric: true },
  },
  {
    id: 'stream',
    header: 'Event stream',
    accessorFn: describeStreamEnd,
    enableSorting: false,
  },
]

function RecentSection({
  runs,
  since,
}: {
  runs: Array<ObservedRun>
  since: number
}) {
  const table = useTable({ features, columns: RECENT, data: runs })
  return (
    <Section
      title="Recent turns"
      description="Turns of yours that have ended, newest first. Open one to see where its time went."
      aside={runs.length ? String(runs.length) : undefined}
    >
      <RowGroup>
        {runs.length === 0 ? (
          <EmptyRow>
            No turn of yours has ended since this process started at{' '}
            {clock(since)}.
          </EmptyRow>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id} className="border-b border-separator">
                    {group.headers.map((header) => {
                      const sorted = header.column.getIsSorted()
                      const numeric = (header.column.columnDef as Column).meta
                        ?.numeric
                      return (
                        <th
                          key={header.id}
                          aria-sort={
                            sorted === 'asc'
                              ? 'ascending'
                              : sorted === 'desc'
                                ? 'descending'
                                : undefined
                          }
                          className={cn(th, 'px-0', numeric && num)}
                        >
                          {header.column.getCanSort() ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className={cn(
                                'flex h-7 w-full items-center gap-1 px-3 outline-none hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                                numeric && 'justify-end',
                              )}
                            >
                              <table.FlexRender header={header} />
                              <span aria-hidden="true" className="w-2">
                                {sorted === 'asc'
                                  ? '↑'
                                  : sorted === 'desc'
                                    ? '↓'
                                    : ''}
                              </span>
                            </button>
                          ) : (
                            <span className="px-3">
                              <table.FlexRender header={header} />
                            </span>
                          )}
                        </th>
                      )
                    })}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-separator/60">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.original.runId} className="hover:bg-hover">
                    {row.getAllCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          td,
                          (cell.column.columnDef as Column).meta?.numeric &&
                            num,
                        )}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </RowGroup>
    </Section>
  )
}

function TotalsSection({
  totals,
}: {
  totals: NonNullable<ObserveOverview['nodeTotals']>
}) {
  const ended = totals.completed + totals.failed + totals.cancelled
  return (
    <Section
      title="Whole node"
      description="Counts for every turn this process admitted, whoever started it. You see them because you hold operator access; no other identity's turns are listed."
    >
      <RowGroup>
        <Row label="Turns admitted">
          <span className="tabular-nums">{totals.admitted}</span>
        </Row>
        <Row label="Turns ended">
          <span className="tabular-nums">
            {ended}
            <span className="text-ink-muted">
              {' '}
              · {totals.completed} completed · {totals.failed} failed ·{' '}
              {totals.cancelled} cancelled
            </span>
          </span>
        </Row>
        <Row label="Event streams opened">
          <span className="tabular-nums">{totals.streamsOpened}</span>
        </Row>
        <Row label="Event streams ended">
          <span className="tabular-nums">
            {totals.streamsEndedAtTerminal} with the turn&rsquo;s ending
            <span className="text-ink-muted">
              {' '}
              · {totals.streamsClientGone} when the page left ·{' '}
              {totals.streamsPollFailed} on a read error ·{' '}
              {totals.streamsDrained} for shutdown
            </span>
          </span>
        </Row>
      </RowGroup>
    </Section>
  )
}

const SIGNALS: Array<{ key: string; label: string }> = [
  { key: 'metrics', label: 'Metrics' },
  { key: 'traces', label: 'Traces' },
  { key: 'logs', label: 'Logs' },
  { key: 'profiles', label: 'Profiles' },
  { key: 'browser', label: 'Browser experience' },
  { key: 'export', label: 'Export' },
]

const SIGNAL_STATE: Record<
  string,
  { tone: Tone; hollow?: boolean; label: string }
> = {
  collected: { tone: 'ok', label: 'Collected' },
  derived: { tone: 'ok', label: 'Read from the record' },
  process_only: { tone: 'quiet', label: 'Process output only' },
  not_collected: { tone: 'quiet', hollow: true, label: 'Not collected' },
  not_configured: { tone: 'quiet', hollow: true, label: 'Not configured' },
}

function SignalsSection({
  telemetry,
}: {
  telemetry: ObserveOverview['telemetry']
}) {
  return (
    <Section
      title="Signals"
      description="Which kinds of evidence this node keeps, and which it does not."
    >
      <RowGroup>
        {SIGNALS.flatMap(({ key, label }) => {
          const signal = telemetry[key]
          if (!signal) return []
          const state = SIGNAL_STATE[signal.state] ?? {
            tone: 'quiet' as const,
            hollow: true,
            label: signal.state,
          }
          return (
            <Row key={key} label={label}>
              <State tone={state.tone} hollow={state.hollow}>
                {state.label}
              </State>
              <p className="mt-0.5 text-ink-muted">{signal.detail}</p>
            </Row>
          )
        })}
      </RowGroup>
    </Section>
  )
}

function LimitsSection({ limits }: { limits: ObserveOverview['limits'] }) {
  return (
    <Section
      title="What this page cannot tell you"
      description="An empty list here means nothing was seen within these limits, not that nothing happened."
    >
      <RowGroup>
        <Row label="Kept in memory">
          <span className="tabular-nums">
            {limits.retained} of {limits.capacity} turns
          </span>
          <span className="text-ink-muted tabular-nums">
            {' '}
            · {limits.evicted} dropped to make room
            {limits.evictedActive
              ? `, ${limits.evictedActive} of them still running`
              : ''}
          </span>
        </Row>
        <Row label="Checked against the record">
          {limits.durableCheck === 'unavailable' ? (
            <State tone="attention">
              The durable store could not be opened
            </State>
          ) : limits.durableCheck === 'checked' ? (
            <State tone="ok">Running turns were checked</State>
          ) : (
            <State tone="quiet" hollow>
              Nothing was running to check
            </State>
          )}
        </Row>
        {limits.notes.map((note) => (
          <p key={note} className="px-3 py-1.5 text-sm text-ink-muted">
            {note}
          </p>
        ))}
      </RowGroup>
    </Section>
  )
}
