// SOURCING: @tanstack/react-query over Theorem's standing-program doors
// (programmable_graph triggers, materialize, set_trigger_paused, agency_proposals,
// agency_approve, stream_read), coss ui NumberField and Frame, and ui Button. Theorem's
// runner fires programs and its agency kernel holds approvals; everything shown here is
// what those said.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type {
  AgencyProposalRow,
  StreamEvent,
  TriggerState,
} from '@/lib/program/api'
import { FramePanel } from '@/components/coss/frame'
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@/components/coss/number-field'
import { Button } from '@/components/ui/button'
import {
  activateProgram,
  approveProposal,
  dismissProposal,
  issueGrant,
  listGrants,
  listProgramApprovals,
  listTriggers,
  loadProgram,
  programGrantScope,
  programKeys,
  readProgramStreams,
  setTriggerPaused,
  suspendGrant,
} from '@/lib/program/api'
import { useProgramDoc } from '@/lib/program/store'
import { Choice, Labeled, Section, ToolError } from './section'

const POLL_MS = 15_000
const NOTICE_LIMIT = 200
const NOTICES_SHOWN = 8

const when = (ms: number | null | undefined) =>
  typeof ms === 'number' ? new Date(ms).toLocaleString() : undefined

function Fact({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="min-w-0 truncate text-ink" title={value}>
        {value}
      </dd>
    </div>
  )
}

function TriggerFacts({ state }: { state: TriggerState }) {
  const last = state.last
  return (
    <>
      <dl className="flex flex-col gap-1">
        <Fact
          label="State"
          value={
            state.paused
              ? 'Paused'
              : state.pending?.status === 'awaiting_approval'
                ? 'Waiting for approval'
                : state.pending
                  ? 'Running'
                  : 'Active'
          }
        />
        {!state.paused && (
          <Fact label="Next due" value={when(state.next_due_ms)} />
        )}
        <Fact
          label="Last run"
          value={
            last
              ? [last.status, when(last.at_ms)].filter(Boolean).join(', ')
              : undefined
          }
        />
        <Fact label="Fired" value={state.fired?.toString()} />
        <Fact
          label="Missed slots"
          value={state.missed_slots ? state.missed_slots.toString() : undefined}
        />
        <Fact
          label="Skipped for budget"
          value={
            state.budget_skipped ? state.budget_skipped.toString() : undefined
          }
        />
      </dl>
      <ToolError error={last?.message} />
    </>
  )
}

/** An edit is a new program by content; the version it replaces stops firing. */
async function pauseEarlierVersions(
  name: string,
  contentId: string | undefined,
  triggers: Array<TriggerState>,
) {
  const earlier = triggers.filter(
    (state) =>
      state.name === name && state.program_id !== contentId && !state.paused,
  )
  await Promise.all(
    earlier.map((state) =>
      loadProgram(state.program_id).then((loaded) =>
        setTriggerPaused(loaded.program, true),
      ),
    ),
  )
}

/** Whether Theorem's runner fires this program, and what it last did. */
export function ScheduleStatus() {
  const program = useProgramDoc((doc) => doc.program)!
  const contentId = useProgramDoc((doc) => doc.contentId)
  const client = useQueryClient()
  const triggers = useQuery({
    queryKey: programKeys.triggers(),
    queryFn: listTriggers,
    refetchInterval: POLL_MS,
  })
  const refresh = () =>
    client.invalidateQueries({ queryKey: programKeys.triggers() })
  const activate = useMutation({
    mutationFn: async () => {
      await pauseEarlierVersions(program.name, contentId, triggers.data ?? [])
      return activateProgram(program)
    },
    onSettled: () => {
      void refresh()
      // Its nodes have graph records now, so a neighborhood can start from them.
      void client.invalidateQueries({
        queryKey: ['programs', 'node-records'],
      })
    },
  })
  const pause = useMutation({
    mutationFn: (paused: boolean) => setTriggerPaused(program, paused),
    onSettled: refresh,
  })
  // Editing an active graph leaves the earlier version firing until it is stopped.
  const pauseRunning = useMutation({
    mutationFn: () =>
      pauseEarlierVersions(program.name, contentId, triggers.data ?? []),
    onSettled: refresh,
  })
  const state = triggers.data?.find(
    (candidate) => candidate.program_id === contentId,
  )
  const replaces = triggers.data?.some(
    (candidate) =>
      candidate.name === program.name &&
      candidate.program_id !== contentId &&
      !candidate.paused,
  )
  return (
    <>
      <ToolError
        error={
          triggers.error ?? activate.error ?? pause.error ?? pauseRunning.error
        }
      />
      {state ? (
        <>
          <TriggerFacts state={state} />
          <Button
            size="sm"
            variant="outline"
            disabled={pause.isPending}
            onClick={() => pause.mutate(!state.paused)}
          >
            {state.paused ? 'Resume' : 'Pause'}
          </Button>
        </>
      ) : (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={activate.isPending || !triggers.data}
            onClick={() => activate.mutate()}
          >
            {replaces ? 'Activate this version' : 'Activate'}
          </Button>
          {replaces && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pauseRunning.isPending}
              onClick={() => pauseRunning.mutate()}
            >
              Pause running version
            </Button>
          )}
        </div>
      )}
    </>
  )
}

function ApprovalRow({ proposal }: { proposal: AgencyProposalRow }) {
  const client = useQueryClient()
  const refresh = () => {
    void client.invalidateQueries({
      queryKey: programKeys.approvals(proposal.program_id),
    })
    void client.invalidateQueries({ queryKey: programKeys.triggers() })
  }
  const approve = useMutation({
    mutationFn: () => approveProposal(proposal.id, proposal.expires_at_ms),
    onSuccess: () => {
      useProgramDoc.getState().setRunFailure(undefined)
    },
    onSettled: refresh,
  })
  const dismiss = useMutation({
    mutationFn: () => dismissProposal(proposal.id, 'Declined on the canvas'),
    onSettled: refresh,
  })
  return (
    <li>
      <FramePanel className="flex flex-col gap-2 border-separator bg-raised p-2">
        <p className="text-ink">{proposal.what_changed}</p>
        {proposal.disclosures.map((disclosure) => (
          <p key={disclosure.id}>{disclosure.text}</p>
        ))}
        <dl className="flex flex-col gap-1">
          <Fact label="Risk" value={proposal.risk_tier} />
          <Fact label="Reversibility" value={proposal.reversibility} />
          <Fact label="Offer expires" value={when(proposal.expires_at_ms)} />
        </dl>
        <ToolError error={approve.error ?? dismiss.error} />
        <div className="flex gap-1">
          <Button
            size="xs"
            disabled={approve.isPending}
            onClick={() => approve.mutate()}
          >
            Approve
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate()}
          >
            Decline
          </Button>
        </div>
      </FramePanel>
    </li>
  )
}

/** Requests waiting on this person, for manual and triggered runs of this exact program. */
export function ApprovalSection() {
  const advisory = useProgramDoc((doc) => doc.program?.authority === 'advisory')
  const contentId = useProgramDoc((doc) => doc.contentId)
  const approvals = useQuery({
    queryKey: programKeys.approvals(contentId),
    queryFn: () => listProgramApprovals(contentId!),
    enabled: !advisory && Boolean(contentId),
    refetchInterval: POLL_MS,
  })
  const waiting = approvals.data?.filter(
    (proposal) => proposal.authoritative_state === 'awaiting_approval',
  )
  if (advisory || (!approvals.error && !waiting?.length)) return null
  return (
    <Section title="Approval">
      <ToolError error={approvals.error} />
      <ul className="flex flex-col gap-2">
        {waiting?.map((proposal) => (
          <ApprovalRow key={proposal.id} proposal={proposal} />
        ))}
      </ul>
    </Section>
  )
}

const APPROVAL_MODES = [
  { value: 'require_each_run', label: 'Ask before every run' },
  { value: 'require_side_effects', label: 'Ask when it has side effects' },
  { value: 'preapproved_within_grants', label: 'Run within a grant' },
] as const

const AUTHORITIES = [
  { value: 'advisory', label: 'Only advise' },
  { value: 'authorization_commit', label: 'Act on your approval' },
] as const

const DAY_MS = 24 * 60 * 60 * 1000

function Count({
  label,
  unit,
  value,
  onChange,
}: {
  label: string
  unit: string
  value: number | null
  onChange: (next: number | null) => void
}) {
  return (
    <Labeled label={label}>
      <NumberField size="sm" value={value} onValueChange={onChange}>
        <NumberFieldGroup>
          <NumberFieldDecrement aria-label={`Fewer ${unit}`} />
          <NumberFieldInput />
          <NumberFieldIncrement aria-label={`More ${unit}`} />
        </NumberFieldGroup>
      </NumberField>
    </Labeled>
  )
}

function GrantForm({ scope }: { scope: string }) {
  const approval = useProgramDoc((doc) => doc.program!.approval)
  const client = useQueryClient()
  const [runs, setRuns] = useState<number | null>(10)
  const [days, setDays] = useState<number | null>(30)
  const issue = useMutation({
    mutationFn: () =>
      issueGrant(scope, Number(runs), Date.now() + Number(days) * DAY_MS),
    onSuccess: ({ grant_id }) => {
      useProgramDoc.getState().setApproval({
        ...approval,
        grant_ids: [...approval.grant_ids, grant_id],
      })
    },
    onSettled: () =>
      client.invalidateQueries({ queryKey: programKeys.grants() }),
  })
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        issue.mutate()
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <Count
          label="Runs allowed"
          unit="runs"
          value={runs}
          onChange={setRuns}
        />
        <Count label="For days" unit="days" value={days} onChange={setDays} />
      </div>
      <ToolError error={issue.error} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={issue.isPending || !(Number(runs) > 0 && Number(days) > 0)}
      >
        Sign a grant
      </Button>
    </form>
  )
}

/** Whether this program only advises or acts; acting is what runs a side effect. */
export function AuthorityChoice() {
  const authority = useProgramDoc((doc) => doc.program!.authority)
  const setAuthority = useProgramDoc((doc) => doc.setAuthority)
  return (
    <Choice
      label="What this program may do"
      value={authority}
      options={AUTHORITIES}
      onChange={setAuthority}
    />
  )
}

/** How this program is allowed to run: asked each time, or within signed grants. */
export function PermissionSection() {
  const authority = useProgramDoc((doc) => doc.program!.authority)
  const approval = useProgramDoc((doc) => doc.program!.approval)
  const name = useProgramDoc((doc) => doc.program!.name)
  const client = useQueryClient()
  const within = approval.mode === 'preapproved_within_grants'
  const grants = useQuery({
    queryKey: programKeys.grants(),
    queryFn: listGrants,
    enabled: within && authority !== 'advisory',
  })
  const suspend = useMutation({
    mutationFn: (grant: { id: string; suspended: boolean }) =>
      suspendGrant(grant.id, grant.suspended),
    onSettled: () =>
      client.invalidateQueries({ queryKey: programKeys.grants() }),
  })
  const scope = programGrantScope(name)
  const mine = grants.data?.filter((grant) => grant.target_scope === scope)
  return (
    <Section title="Permission">
      <AuthorityChoice />
      {authority !== 'advisory' && (
        <Choice
          label="How this program may run"
          value={approval.mode}
          options={APPROVAL_MODES}
          onChange={(mode) =>
            useProgramDoc.getState().setApproval({ ...approval, mode })
          }
        />
      )}
      {authority !== 'advisory' && within && (
        <>
          <ToolError error={grants.error ?? suspend.error} />
          <ul className="flex flex-col gap-1">
            {mine?.map((grant) => (
              <li key={grant.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {grant.program_executions ?? 0} of {grant.maximum_frequency}{' '}
                  runs, until {when(grant.expires_at_ms)}
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={suspend.isPending}
                  onClick={() =>
                    suspend.mutate({
                      id: grant.id,
                      suspended: !grant.suspended,
                    })
                  }
                >
                  {grant.suspended ? 'Restore' : 'Suspend'}
                </Button>
              </li>
            ))}
          </ul>
          <GrantForm scope={scope} />
        </>
      )}
    </Section>
  )
}

const noticeText = (event: StreamEvent) => {
  const chip = event.payload?.chip
  if (typeof chip === 'string') return chip
  if (event.kind === 'program.approval_required') return 'Asked for approval'
  return event.kind ?? 'Notice'
}

/** What this program's standing runs told the person, newest first. */
export function NoticesSection() {
  const contentId = useProgramDoc((doc) => doc.contentId)
  const notices = useQuery({
    queryKey: programKeys.streams(),
    queryFn: () => readProgramStreams(NOTICE_LIMIT),
    refetchInterval: POLL_MS,
  })
  const mine = notices.data
    ?.filter((event) => event.payload?.program_id === contentId)
    .reverse()
    .slice(0, NOTICES_SHOWN)
  if (!notices.error && !mine?.length) return null
  return (
    <Section title="Notices">
      <ToolError error={notices.error} />
      <ol className="flex flex-col gap-1">
        {mine?.map((event, index) => (
          <li key={event.id ?? index} className="flex flex-col">
            <span className="break-words text-ink">{noticeText(event)}</span>
            {event.created_at && <span>{event.created_at}</span>}
          </li>
        ))}
      </ol>
    </Section>
  )
}
