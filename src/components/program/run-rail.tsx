// SOURCING: @tanstack/react-query for resume over programmable_graph_apply; a run itself
// starts and streams through ../../lib/program/run. coss ui Textarea, Input and Badge, ui
// Button. Everything shown here is what Theorem said; there is no engine or liveness on
// this side (SPEC-PROGRAM-CANVAS law).
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ProgramRunPark } from '@/lib/program/contracts'
import { Badge } from '@/components/coss/badge'
import { Input } from '@/components/coss/input'
import { Textarea } from '@/components/coss/textarea'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/icons'
import {
  programAuthorization,
  programKeys,
  requestApproval,
} from '@/lib/program/api'
import { answerParkedRun, startProgramRun } from '@/lib/program/run'
import { useProgramDoc } from '@/lib/program/store'
import { describeError } from '@/lib/theorem/client'
import { Choice, Json, Labeled, Section, ToolError } from './section'
import {
  ApprovalSection,
  PermissionSection,
  NoticesSection,
  ScheduleStatus,
} from './standing-sections'

function runOptions() {
  const { layout, tweaks } = useProgramDoc.getState()
  return {
    pinned_nodes: layout.pins ?? {},
    tweaks,
  }
}

/**
 * Anything past advisory runs on a person's durable approval. With none to spend, the
 * request is filed and shown in Approval; Theorem still decides at admission.
 */
async function authorizeAndRun(client: QueryClient) {
  const { program, contentId, setRunFailure } = useProgramDoc.getState()
  if (!program) return
  try {
    let authorization = await programAuthorization(program)
    if (!authorization) {
      await requestApproval(program)
      // Within a grant, filing the request is what authorizes the run.
      authorization = await programAuthorization(program)
    }
    if (authorization) await startProgramRun(runOptions(), authorization)
    else setRunFailure('This program needs your approval before it runs.')
  } catch (failure) {
    setRunFailure(describeError(failure))
  }
  // A run spends its approval or a grant's allowance, so both read fresh after it.
  void client.invalidateQueries({ queryKey: programKeys.approvals(contentId) })
  void client.invalidateQueries({ queryKey: programKeys.grants() })
}

function Parked({ park }: { park: ProgramRunPark }) {
  const [answer, setAnswer] = useState('')
  const resume = useMutation({
    mutationFn: () =>
      answerParkedRun(park.resume_token, {
        ...runOptions(),
        human_answers: { [park.node_id]: { answer } },
      }),
  })
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        resume.mutate()
      }}
    >
      <Labeled label={park.prompt}>
        <Textarea
          size="sm"
          rows={3}
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
        />
      </Labeled>
      <Button
        type="submit"
        size="sm"
        disabled={!answer.trim() || resume.isPending}
      >
        Answer and resume
      </Button>
      <ToolError error={resume.error} />
    </form>
  )
}

export function RunRail() {
  const receipt = useProgramDoc((doc) => doc.receipt)
  const select = useProgramDoc((doc) => doc.select)
  const run = useProgramDoc((doc) => doc.run)
  const client = useQueryClient()
  const park = receipt?.parked
  // Token chunks stream into the node; the list keeps what happened to it.
  const events = (receipt?.events ?? run?.events ?? []).filter(
    (event) => event.kind !== 'node_token_chunk',
  )
  const runId = receipt?.run_id ?? run?.runId
  return (
    <>
      <Section title="Run">
        <Button
          size="sm"
          disabled={run?.active}
          onClick={() => void authorizeAndRun(client)}
        >
          <Icon.Play />
          {run?.active ? 'Running' : 'Run program'}
        </Button>
        <ToolError error={run?.failure} />
      </Section>
      <PermissionSection />
      <ApprovalSection />
      <Section title="Trigger">
        <TriggerEditor />
        <ScheduleStatus />
      </Section>
      <NoticesSection />
      {park && (
        <Section title="Waiting on you">
          <Parked key={park.ask_id} park={park} />
        </Section>
      )}
      {events.length > 0 && (
        <Section title={`Events, run ${runId?.split(':').at(-1)?.slice(0, 8)}`}>
          <ol className="flex flex-col gap-1">
            {events.map((event) => (
              <li key={event.sequence}>
                <Button
                  variant="ghost"
                  size="xs"
                  className="w-full justify-start gap-2 px-1 text-left font-normal"
                  onClick={() => select(event.node_id)}
                >
                  <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                    {event.sequence}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {event.node_id} {event.kind}
                  </span>
                  {event.cached && (
                    <Badge size="sm" variant="secondary">
                      cached
                    </Badge>
                  )}
                  {event.refusal_code && (
                    <Badge size="sm" variant="error">
                      {event.refusal_code}
                    </Badge>
                  )}
                </Button>
                {event.message && (
                  <p className="px-1 break-words">{event.message}</p>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}
      {receipt?.validation != null && (
        <Section title="Validation">
          <Json value={receipt.validation} />
        </Section>
      )}
    </>
  )
}

type ProgramTrigger = NonNullable<
  ReturnType<typeof useProgramDoc.getState>['program']
>['trigger']

const TRIGGER_KINDS: ReadonlyArray<{
  value: ProgramTrigger['kind']
  label: string
}> = [
  { value: 'graph_change', label: 'When the graph changes' },
  { value: 'schedule', label: 'On a schedule' },
  { value: 'coordination_stream', label: 'On a coordination stream' },
]

const NEW_TRIGGER: { [K in ProgramTrigger['kind']]: ProgramTrigger } = {
  graph_change: { kind: 'graph_change', labels: [], properties: [] },
  schedule: { kind: 'schedule', cron: '0 9 * * *' },
  coordination_stream: { kind: 'coordination_stream', stream: '' },
}

function words(text: string) {
  return text
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean)
}

/** A trigger field: typing stays here until it is left, so a half-typed value never saves. */
function TriggerField({
  label,
  hint,
  placeholder,
  value,
  onCommit,
}: {
  label: string
  hint?: string
  placeholder?: string
  value: string
  onCommit: (next: string) => void
}) {
  const [text, setText] = useState(value)
  return (
    <Labeled label={label} hint={hint}>
      <Input
        size="sm"
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (text !== value) onCommit(text)
        }}
      />
    </Labeled>
  )
}

/** A standing program's trigger: Theorem's runner fires it, saved with the program. */
function TriggerEditor() {
  const trigger = useProgramDoc((doc) => doc.program?.trigger)
  const setTrigger = useProgramDoc((doc) => doc.setTrigger)
  if (!trigger) return null
  return (
    <>
      <Choice
        label="When this runs"
        value={trigger.kind}
        options={TRIGGER_KINDS}
        onChange={(kind) => {
          if (kind !== trigger.kind) setTrigger(NEW_TRIGGER[kind])
        }}
      />
      {trigger.kind === 'graph_change' && (
        <>
          <TriggerField
            key={`labels:${trigger.labels.join()}`}
            label="Labels"
            hint="A change has to carry all of these. Leave empty for any."
            placeholder="Spec, Deliverable"
            value={trigger.labels.join(', ')}
            onCommit={(next) => setTrigger({ ...trigger, labels: words(next) })}
          />
          <TriggerField
            key={`properties:${trigger.properties.join()}`}
            label="Properties"
            hint="A change has to touch one of these. Leave empty for any."
            placeholder="status, title"
            value={trigger.properties.join(', ')}
            onCommit={(next) =>
              setTrigger({ ...trigger, properties: words(next) })
            }
          />
        </>
      )}
      {trigger.kind === 'schedule' && (
        <TriggerField
          key={trigger.cron}
          label="Cron schedule"
          placeholder="0 9 * * *"
          value={trigger.cron}
          onCommit={(cron) => setTrigger({ kind: 'schedule', cron })}
        />
      )}
      {trigger.kind === 'coordination_stream' && (
        <TriggerField
          key={trigger.stream}
          label="Stream"
          value={trigger.stream}
          onCommit={(stream) =>
            setTrigger({ kind: 'coordination_stream', stream })
          }
        />
      )}
    </>
  )
}
