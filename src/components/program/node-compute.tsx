// SOURCING: @tanstack/react-query over Theorem's tool_search and affordance_score_events,
// the inspector's Section pattern, and the vendored coss Input, Badge and Frame. A node's
// own view of what Theorem computed about it.
import { useDebouncedValue } from '@tanstack/react-pacer'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type {
  ProgramNode,
  ProgramNodeInspection,
} from '@/lib/program/contracts'
import {
  describeAffordance,
  rankAffordances,
  recordOutcome,
} from '@/lib/program/compute'
import type { AffordanceOutcome } from '@/lib/program/compute'
import { AFFORDANCE_BLOCK, useProgramDoc } from '@/lib/program/store'
import { Badge } from '@/components/coss/badge'
import { Frame, FramePanel } from '@/components/coss/frame'
import { Input } from '@/components/coss/input'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Json, Section, ToolError } from './section'

export function NodeDiagnostics({ nodeId }: { nodeId: string }) {
  const diagnostics = useProgramDoc((doc) => doc.diagnostics[nodeId])
  if (!diagnostics?.length) return null
  return (
    <Section title="Lint">
      <ul className="flex flex-col gap-1.5">
        {diagnostics.map((diagnostic) => (
          <li key={diagnostic.id}>
            <p className="text-ink">{diagnostic.message}</p>
            <p className="flex items-center gap-1.5 text-ink-muted">
              <Badge variant={diagnostic.severity} size="sm">
                {diagnostic.severity}
              </Badge>
              <span className="min-w-0 truncate">{diagnostic.rule_id}</span>
            </p>
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function Attachments({ nodeId }: { nodeId: string }) {
  const attachments = useProgramDoc((doc) => doc.layout.attachments?.[nodeId])
  const detach = useProgramDoc((doc) => doc.detach)
  if (!attachments?.length) return null
  return (
    <Section title="Attached">
      <ul className="flex flex-col gap-3">
        {attachments.map((attachment) => (
          <li key={attachment.id}>
            <Frame className="p-0.5">
              <FramePanel className="flex flex-col gap-1 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink">{attachment.title}</span>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => detach(nodeId, attachment.id)}
                  >
                    Remove
                  </Button>
                </div>
                <Json value={attachment.value} />
              </FramePanel>
            </Frame>
          </li>
        ))}
      </ul>
    </Section>
  )
}

const OUTCOMES: Array<{ outcome: AffordanceOutcome; label: string }> = [
  { outcome: 'output_used', label: 'Used it' },
  { outcome: 'output_discarded', label: 'Discarded it' },
  { outcome: 'user_correction', label: 'Corrected it' },
]

/**
 * Candidates ranked by Theorem. Eligibility stays with Theorem: only what it returns can be
 * chosen, and only an Affordance node runs what was chosen for it.
 */
export function Affordances({
  node,
  inspection,
}: {
  node: ProgramNode
  inspection: ProgramNodeInspection | undefined
}) {
  const chooseAffordance = useProgramDoc((doc) => doc.chooseAffordance)
  const queryClient = useQueryClient()
  const runId = useProgramDoc((doc) => doc.receipt?.run_id)
  const intent = useProgramDoc((doc) => doc.program?.intent)
  // The node's name and the program's purpose; a node's contract is often generic.
  const [query, setQuery] = useState(
    [node.id.replaceAll('-', ' '), intent].filter(Boolean).join(' '),
  )
  const [settled] = useDebouncedValue(query, { wait: 300 })
  const candidates = useQuery({
    queryKey: ['programs', 'affordances', settled],
    queryFn: () => rankAffordances(settled),
    enabled: settled.trim().length > 0,
    retry: false,
  })
  const choosable = node.block_id === AFFORDANCE_BLOCK
  const chosen =
    choosable &&
    node.kind === 'stochastic' &&
    node.affordance_id !== node.block_id
      ? node.affordance_id
      : undefined
  const description = useQuery({
    queryKey: ['programs', 'affordance', chosen],
    queryFn: () => describeAffordance(chosen ?? ''),
    enabled: chosen !== undefined,
    retry: false,
  })
  const takes = Object.keys(description.data?.input_schema?.properties ?? {})
  const outcome = useMutation({
    mutationFn: (next: AffordanceOutcome) => {
      if (!chosen || !runId) throw new Error('Run this node first.')
      return recordOutcome(chosen, runId, next, settled)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['programs', 'affordances'] }),
  })
  return (
    <Section title="Affordances" Mark={Icon.Route}>
      <Input
        size="sm"
        aria-label="What this node should do"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ToolError error={candidates.error} />
      {chosen && (
        <p className="mt-2 text-ink">
          Runs {chosen}
          {takes.length > 0 && (
            <span className="text-ink-muted"> · takes {takes.join(', ')}</span>
          )}
        </p>
      )}
      {candidates.data?.ranking && (
        <p className="mt-2 text-ink-faint">{candidates.data.ranking}</p>
      )}
      <ol className="mt-2 flex flex-col gap-2">
        {candidates.data?.results.map((candidate, index) => (
          <li
            key={candidate.affordance_id ?? `${candidate.name}:${index}`}
            className="flex items-start justify-between gap-2"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-ink">
                <span className="min-w-0 truncate">
                  {index + 1}. {candidate.name ?? candidate.affordance_id}
                </span>
                {candidate.affordance_id === chosen && (
                  <Badge variant="secondary" size="sm">
                    chosen
                  </Badge>
                )}
              </p>
              <p className="text-ink-muted">{candidate.one_line_description}</p>
              {candidate.matched_terms &&
                candidate.matched_terms.length > 0 && (
                  <p className="text-ink-faint">
                    Matches {candidate.matched_terms.join(', ')}
                  </p>
                )}
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-ink-faint">
                {candidate.score !== undefined && (
                  <span>score {candidate.score.toFixed(3)}</span>
                )}
                {candidate.fitness !== undefined && (
                  <span>fitness {candidate.fitness.toFixed(2)}</span>
                )}
                {candidate.status && (
                  <Badge variant="outline" size="sm" className="text-ink-muted">
                    {candidate.status}
                  </Badge>
                )}
                {candidate.degraded_reason && (
                  <span>{candidate.degraded_reason}</span>
                )}
              </p>
            </div>
            {choosable &&
              candidate.affordance_id &&
              candidate.affordance_id !== chosen && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    if (candidate.affordance_id)
                      chooseAffordance(node.id, candidate.affordance_id)
                  }}
                >
                  Choose
                </Button>
              )}
          </li>
        ))}
      </ol>
      {chosen && inspection?.outputs && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {OUTCOMES.map((option) => (
            <Button
              key={option.outcome}
              size="xs"
              variant={
                outcome.variables === option.outcome ? 'secondary' : 'outline'
              }
              disabled={outcome.isPending}
              onClick={() => outcome.mutate(option.outcome)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
      <ToolError error={outcome.error} />
    </Section>
  )
}
