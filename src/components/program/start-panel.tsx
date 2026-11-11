// SOURCING: @xyflow/react Panel, @tanstack/react-query over Theorem's starters. The one
// way into a canvas with nothing on it: a first step, or a template.
import { useQuery } from '@tanstack/react-query'
import { Panel } from '@xyflow/react'
import { Button } from '@/components/ui/button'
import { listStarters, programKeys } from '@/lib/program/api'
import { useNewGraph } from './new-graph'
import { ToolError } from './section'

export function StartPanel({
  message,
  action,
  onAction,
  replacing,
}: {
  message: string
  action: string
  onAction: () => void
  /** The blank draft a template fills in; without one a template starts its own graph. */
  replacing?: string
}) {
  const starters = useQuery({
    queryKey: programKeys.starters(),
    queryFn: listStarters,
  })
  const fromTemplate = useNewGraph()
  return (
    <Panel
      position="top-center"
      className="mt-24 flex w-96 flex-col items-center gap-3 rounded-lg border border-separator bg-raised p-4"
    >
      <p className="text-sm text-ink">{message}</p>
      <Button size="sm" onClick={onAction}>
        {action}
      </Button>
      <div className="flex w-full flex-col items-center gap-1.5">
        <p className="text-xs text-ink-muted">Or start from a template</p>
        <div className="flex flex-wrap justify-center gap-1">
          {starters.data?.map((starter) => (
            <Button
              key={starter.name}
              size="xs"
              variant="outline"
              disabled={fromTemplate.isPending}
              title={starter.intent}
              onClick={() => fromTemplate.mutate({ starter, replacing })}
            >
              {starter.name}
            </Button>
          ))}
        </div>
      </div>
      <ToolError error={starters.error ?? fromTemplate.error} />
    </Panel>
  )
}
