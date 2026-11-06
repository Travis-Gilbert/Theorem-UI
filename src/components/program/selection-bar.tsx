// SOURCING: @xyflow/react Panel, coss ui Group, the shell's Dialog (Base UI), @tanstack/react-query.
// Theorem computes the boundary and refuses a subgraph with a dangling input; this
// shows what it says and publishes what it returned.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Panel } from '@xyflow/react'
import { useState } from 'react'
import { Group, GroupSeparator, GroupText } from '@/components/coss/group'
import { Input } from '@/components/coss/input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { extractSubgraph, programKeys, publishProgram } from '@/lib/program/api'
import type { ProgramPort } from '@/lib/program/contracts'
import { useProgramDoc } from '@/lib/program/store'
import { ToolError } from './section'

function Ports({ title, ports }: { title: string; ports: Array<ProgramPort> }) {
  return (
    <div className="min-w-0 flex-1">
      <h4 className="mb-1 text-xs font-medium text-ink">{title}</h4>
      <ul className="flex flex-col gap-0.5 text-xs text-ink-muted">
        {ports.map((port) => (
          <li key={port.id} className="truncate" title={port.shape_id}>
            {port.id}
          </li>
        ))}
        {ports.length === 0 && <li>None</li>}
      </ul>
    </div>
  )
}

function PublishDialog({
  nodeIds,
  onClose,
}: {
  nodeIds: Array<string>
  onClose: () => void
}) {
  const program = useProgramDoc((doc) => doc.program)!
  const client = useQueryClient()
  const [name, setName] = useState(`${program.name} block`)
  const extract = useQuery({
    queryKey: [...programKeys.all, 'subgraph', nodeIds, name],
    queryFn: () => extractSubgraph(program, nodeIds, name),
    enabled: name.trim().length > 0,
    retry: false,
  })
  const publish = useMutation({
    mutationFn: () => publishProgram(extract.data!.program),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: programKeys.catalog() })
      onClose()
    },
  })
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Publish {nodeIds.length} nodes as a block</DialogTitle>
      </DialogHeader>
      <Input
        size="sm"
        aria-label="Block name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <ToolError error={extract.error} />
      {extract.data && (
        <div className="flex gap-4">
          <Ports title="Inputs" ports={extract.data.boundary.inputs} />
          <Ports title="Outputs" ports={extract.data.boundary.outputs} />
        </div>
      )}
      <ToolError error={publish.error} />
      <Button
        className="self-end"
        size="sm"
        disabled={!extract.data || publish.isPending}
        onClick={() => publish.mutate()}
      >
        {publish.isPending ? 'Publishing' : 'Publish'}
      </Button>
    </DialogContent>
  )
}

export function SelectionBar() {
  const selection = useProgramDoc((doc) => doc.selection)
  const program = useProgramDoc((doc) => doc.program)!
  const group = useProgramDoc((doc) => doc.group)
  const [publishing, setPublishing] = useState(false)
  const nodeIds = selection.filter((id) =>
    program.nodes.some((node) => node.id === id),
  )
  if (nodeIds.length < 2) return null
  return (
    <Panel position="top-center">
      <Group aria-label="Selected nodes" className="bg-raised">
        <GroupText className="h-7 text-xs">{nodeIds.length} selected</GroupText>
        <GroupSeparator />
        <Button size="sm" variant="outline" onClick={() => group(nodeIds)}>
          Group
        </Button>
        <GroupSeparator />
        <Button size="sm" variant="outline" onClick={() => setPublishing(true)}>
          Publish
        </Button>
      </Group>
      <Dialog open={publishing} onOpenChange={setPublishing}>
        {publishing && (
          <PublishDialog
            nodeIds={nodeIds}
            onClose={() => setPublishing(false)}
          />
        )}
      </Dialog>
    </Panel>
  )
}
