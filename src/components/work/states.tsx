// SOURCING: coss ui Empty and Button; ./settings for what is connected and ./queries for sync, so each empty state says what is true: nothing connected, still importing, or nothing matching
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/coss/empty'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import { ago } from './marks'
import { useSyncNow } from './queries'
import { useWorkTracker } from './settings'
import { useWorkSource } from './source'

/** Where GitHub is connected; the Connections setting owns it. */
export const CONNECTIONS_HREF = '/settings/connections'

/**
 * What a list shows when it has no rows. `filtered` means a filter is on, so
 * the honest answer is "nothing matches"; otherwise it depends on what is
 * connected and whether the first import is still running.
 */
export function WorkEmpty({
  filtered,
  onClear,
  onCreate,
}: {
  filtered: boolean
  onClear?: () => void
  onCreate?: () => void
}) {
  const tracker = useWorkTracker()
  const sync = tracker.state === 'on' ? tracker.settings.sync : undefined
  const connected =
    tracker.state === 'on' &&
    tracker.github &&
    tracker.settings.github.repos.length > 0

  if (filtered)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Nothing matches</EmptyTitle>
          <EmptyDescription>
            No item fits this view's filters.
          </EmptyDescription>
        </EmptyHeader>
        {onClear && (
          <EmptyContent>
            <Button size="sm" variant="outline" onClick={onClear}>
              Clear filters
            </Button>
          </EmptyContent>
        )}
      </Empty>
    )

  if (connected && sync?.state === 'running')
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Importing from GitHub</EmptyTitle>
          <EmptyDescription>
            Issues and pull requests appear here as they arrive.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          {connected ? 'No work yet' : 'Nothing to track yet'}
        </EmptyTitle>
        <EmptyDescription>
          {connected
            ? 'Nothing has been imported from the connected repositories.'
            : 'Connect GitHub to bring in issues and pull requests, or start with a local item.'}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex gap-2">
          {!connected && (
            <a
              href={CONNECTIONS_HREF}
              className="inline-flex h-7 items-center rounded-lg border border-separator px-2.5 text-sm hover:bg-hover"
            >
              Connect GitHub
            </a>
          )}
          {onCreate && (
            <Button size="sm" onClick={onCreate}>
              <Icon.Add />
              Create a local item
            </Button>
          )}
        </div>
      </EmptyContent>
    </Empty>
  )
}

/** The sync state in one line, with "Sync now" when the source can. */
export function SyncStatus({ className }: { className?: string }) {
  const tracker = useWorkTracker()
  const source = useWorkSource()
  const sync = useSyncNow()
  if (tracker.state !== 'on' || !tracker.github) return null
  const state = tracker.settings.sync
  const label =
    state.state === 'running'
      ? 'Syncing...'
      : state.state === 'error'
        ? (state.detail ?? 'Sync failed')
        : state.lastSyncedAt
          ? `Synced ${ago(state.lastSyncedAt)} ago`
          : 'Not synced yet'
  return (
    <div className={className}>
      <span
        className={
          state.state === 'error' ? 'text-error-ink' : 'text-ink-muted'
        }
      >
        {label}
      </span>
      {source.sync && (
        <Button
          size="xs"
          variant="ghost"
          disabled={state.state === 'running' || sync.isPending}
          onClick={() => sync.mutate(undefined)}
        >
          <Icon.Refresh />
          Sync now
        </Button>
      )}
      {sync.isError && (
        <span role="alert" className="text-error-ink">
          {describeError(sync.error)}
        </span>
      )}
    </div>
  )
}
