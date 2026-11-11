// SOURCING: @xyflow/react Panel, @tanstack/react-query. A compiler's proposal stays
// advisory until a person answers it: Theorem says whether it can be accepted, and
// accepting materializes it with the compiler named in the receipt.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Panel } from '@xyflow/react'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/coss/alert'
import { Badge } from '@/components/coss/badge'
import { Textarea } from '@/components/coss/textarea'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  acceptProposal,
  listProposals,
  programKeys,
  rejectProposal,
} from '@/lib/program/api'
import type { PendingProposal, ProposalReceipt } from '@/lib/program/api'
import { changedFields, ghostPlaces } from '@/lib/program/flow'
import { useProgramDoc } from '@/lib/program/store'
import { ToolError } from './section'

function Change({ label, items }: { label: string; items: Array<string> }) {
  if (items.length === 0) return null
  return (
    <li>
      <span className="text-ink">{label}</span>{' '}
      <span className="break-all">{items.join(', ')}</span>
    </li>
  )
}

function Diff({ pending }: { pending: PendingProposal }) {
  const program = useProgramDoc((doc) => doc.program)!
  const diff = pending.diff
  if (!diff) return null
  const proposed = pending.proposal.proposed_program
  const changes = diff.changed_node_ids.map((id) => {
    const before = program.nodes.find((node) => node.id === id)
    const after = proposed.nodes.find((node) => node.id === id)
    const fields = before && after ? changedFields(before, after) : []
    return `${id} (${fields.join(', ')})`
  })
  return (
    <ul className="flex flex-col gap-1 text-xs text-ink-muted">
      <Change label="Adds nodes" items={diff.node_ids_only_in_right} />
      <Change label="Removes nodes" items={diff.node_ids_only_in_left} />
      <Change label="Changes" items={changes} />
      <Change label="Adds edges" items={diff.edge_ids_only_in_right} />
      <Change label="Removes edges" items={diff.edge_ids_only_in_left} />
      {diff.metadata_changed && <li className="text-ink">Changes metadata</li>}
      {diff.authority_changed && (
        <li className="text-ink">Changes authority</li>
      )}
    </ul>
  )
}

export function ProposalReview() {
  const nodeId = useProgramDoc((doc) => doc.nodeId)!
  const contentId = useProgramDoc((doc) => doc.contentId)
  const client = useQueryClient()
  const [index, setIndex] = useState(0)
  const [reason, setReason] = useState('')
  const [receipt, setReceipt] = useState<ProposalReceipt>()
  const proposals = useQuery({
    queryKey: programKeys.proposals(nodeId, contentId),
    queryFn: () => listProposals(nodeId, useProgramDoc.getState().program!),
    refetchInterval: 15_000,
    retry: false,
  })
  const count = proposals.data?.length ?? 0
  const pending = proposals.data?.[Math.min(index, Math.max(0, count - 1))]
  const pendingId = pending?.proposal_id
  useEffect(() => {
    const doc = useProgramDoc.getState()
    if (!pending) {
      doc.showProposal(undefined, {})
      return
    }
    let live = true
    void ghostPlaces(pending.proposal.proposed_program, doc.positions).then(
      (places) => {
        if (live) useProgramDoc.getState().showProposal(pending, places)
      },
    )
    return () => {
      live = false
    }
    // A refetch of the same proposal keeps its ghost where it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId])
  useEffect(
    () => () => useProgramDoc.getState().showProposal(undefined, {}),
    [],
  )

  const answered = () =>
    client.invalidateQueries({
      queryKey: programKeys.proposals(nodeId, contentId),
    })
  const accept = useMutation({
    mutationFn: (proposal: PendingProposal) =>
      acceptProposal(proposal.proposal_id),
    onSuccess: (done, proposal) => {
      const doc = useProgramDoc.getState()
      doc.adoptProposal(proposal, doc.proposalPlaces)
      setReceipt(done)
      void answered()
    },
  })
  const reject = useMutation({
    mutationFn: (proposal: PendingProposal) =>
      rejectProposal(proposal.proposal_id, reason),
    onSuccess: () => {
      setReason('')
      void answered()
    },
  })
  if (!pending) {
    if (proposals.isError) {
      return (
        <Panel
          position="top-right"
          className="w-80 rounded-lg border border-separator bg-raised p-2"
        >
          <ToolError error={proposals.error} />
        </Panel>
      )
    }
    if (!receipt) return null
    return (
      <Panel
        position="top-right"
        className="flex w-80 items-start gap-2 rounded-lg border border-separator bg-raised p-2 text-xs text-ink-muted"
      >
        <p className="min-w-0 flex-1 break-words">
          Compiled by {receipt.compiler_id} as {receipt.program_id}, receipt{' '}
          {receipt.receipt_id}
        </p>
        <Button size="xs" variant="ghost" onClick={() => setReceipt(undefined)}>
          Dismiss
        </Button>
      </Panel>
    )
  }
  return (
    <Panel
      position="top-right"
      className="flex max-h-[70%] w-80 flex-col gap-2 overflow-y-auto rounded-lg border border-separator bg-raised p-3"
    >
      <header className="flex items-center gap-2">
        <Icon.Proposal className="size-4 shrink-0 text-ink-muted" />
        <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          Proposal from {pending.proposal.compiler_id}
        </h3>
        <Badge variant="outline">Advisory</Badge>
      </header>
      <p className="text-xs text-ink-muted">{pending.proposal.source_intent}</p>
      <Diff pending={pending} />
      {pending.refusal && (
        <Alert variant="error" className="px-2.5 py-2">
          <AlertDescription className="text-xs break-words">
            {pending.refusal.message}
          </AlertDescription>
        </Alert>
      )}
      <ToolError error={accept.error ?? reject.error} />
      <Textarea
        size="sm"
        aria-label="Reason for rejecting"
        placeholder="Reason, to reject"
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="flex items-center gap-1">
        {count > 1 && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setIndex((index + 1) % count)}
          >
            Next of {count}
          </Button>
        )}
        <Button
          className="ml-auto"
          size="xs"
          variant="outline"
          disabled={!reason.trim() || reject.isPending}
          onClick={() => reject.mutate(pending)}
        >
          <Icon.Reject className="size-3" />
          Reject
        </Button>
        <Button
          size="xs"
          disabled={!pending.acceptable || accept.isPending}
          onClick={() => accept.mutate(pending)}
        >
          Accept
        </Button>
      </div>
    </Panel>
  )
}
