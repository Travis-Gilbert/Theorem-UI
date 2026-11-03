// SOURCING: the handler registry (plan D13): a file shown as the Card of the
// handler that opens it, for canvases and Markdown embeds. The entry comes
// from the workspace tree's cache.
import { handlerFor, matchInput, useHandlerRegistry } from '@/lib/handlers/registry'
import type { WorkspaceClient } from '@/lib/workspace/types'
import { useWorkspaceEntry } from '@/lib/workspace/workspaces'
import { cn } from '@/lib/utils'

export function FileCard({
  client,
  path,
  zoom,
  selected,
  className,
}: {
  client: WorkspaceClient
  path: string
  zoom: number
  selected: boolean
  className?: string
}) {
  const entry = useWorkspaceEntry(client, path)
  const handlers = useHandlerRegistry((s) => s.handlers)
  const handler = entry.data && handlerFor(matchInput(entry.data), handlers)

  if (!entry.data || !handler)
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center p-3 text-xs text-ink-faint',
          className,
        )}
      >
        {entry.isPending ? 'Loading…' : `${path} is not in this folder.`}
      </div>
    )
  const { Card } = handler
  return (
    <div className={cn('h-full min-h-0 overflow-hidden', className)}>
      <Card
        client={client}
        path={path}
        entry={entry.data}
        zoom={zoom}
        selected={selected}
      />
    </div>
  )
}
