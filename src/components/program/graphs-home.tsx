// SOURCING: @xyflow/react (the empty canvas) over Theorem's list. What /canvas opens on with
// no graph open. The sidebar lists the graphs, so this offers only what it cannot: a start.
// Someone with no graphs yet goes straight to a blank one.
import { useQuery } from '@tanstack/react-query'
import { Background, BackgroundVariant, ReactFlow } from '@xyflow/react'
import { useEffect, useRef } from 'react'
import { listPrograms, programKeys } from '@/lib/program/api'
import { useNewGraph } from './new-graph'
import { ToolError } from './section'
import { StartPanel } from './start-panel'

export function GraphsHome() {
  const graphs = useQuery({
    queryKey: programKeys.list(),
    queryFn: listPrograms,
  })
  const newGraph = useNewGraph()
  const isNew = graphs.data?.length === 0
  const started = useRef(false)
  const { mutate } = newGraph
  useEffect(() => {
    if (!isNew || started.current) return
    started.current = true
    mutate({ replace: true })
  }, [isNew, mutate])
  return (
    <ReactFlow
      nodes={[]}
      edges={[]}
      panOnDrag={false}
      zoomOnScroll={false}
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1.5} />
      {graphs.data && !isNew && (
        <StartPanel
          message="Pick a graph from the list, or start a new one."
          action="New graph"
          onAction={() => newGraph.mutate({})}
        />
      )}
      {(newGraph.isError || graphs.isError) && (
        <div className="absolute bottom-3 left-1/2 w-full max-w-lg -translate-x-1/2 px-3">
          <ToolError error={newGraph.error ?? graphs.error} />
        </div>
      )}
    </ReactFlow>
  )
}
