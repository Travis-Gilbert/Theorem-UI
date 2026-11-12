// SOURCING: coss ui Collapsible and SegmentedControl over lib/theorem/connections' paged deliveries (GET /github/deliveries) and retry; fetched only once the disclosure is opened
import { useState } from 'react'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/coss/collapsible'
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/coss/segmented-control'
import { Icon } from '@/components/icons'
import { SettingsBox } from '@/components/settings/settings-frame'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import {
  useGithubDeliveries,
  useGithubMutations,
} from '@/lib/theorem/connections'
import type { DeliveryState, GithubDelivery } from '@/lib/theorem/connections'
import { DeliveryBadge, ago } from './parts'

/** Webhook deliveries GitHub has sent, newest first, with a way to run a failed one again. */
export function GithubDeliveries() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<DeliveryState | undefined>()
  const deliveries = useGithubDeliveries(state, open)
  const { retryDelivery } = useGithubMutations()
  const rows = deliveries.data?.pages.flatMap((page) => page.deliveries) ?? []

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group flex items-center gap-1.5 rounded-sm text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-focus">
        <Icon.ChevronRight className="size-4 transition-transform group-data-panel-open:rotate-90" />
        Recent deliveries
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="flex flex-col gap-3 pt-3">
          <SegmentedControl size="sm" role="group" aria-label="Deliveries shown">
            <SegmentedControlItem
              aria-pressed={state === undefined}
              data-pressed={state === undefined ? '' : undefined}
              onClick={() => setState(undefined)}
            >
              All
            </SegmentedControlItem>
            <SegmentedControlItem
              aria-pressed={state === 'failed'}
              data-pressed={state === 'failed' ? '' : undefined}
              onClick={() => setState('failed')}
            >
              Failed
            </SegmentedControlItem>
          </SegmentedControl>

          {deliveries.error ? (
            <p role="alert" className="text-sm text-error-ink">
              {describeError(deliveries.error)}
            </p>
          ) : deliveries.isPending ? (
            <p className="text-sm text-ink-muted">Checking...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {state === 'failed'
                ? 'No delivery has failed.'
                : 'GitHub has not delivered anything yet.'}
            </p>
          ) : (
            <SettingsBox>
              {rows.map((delivery) => (
                <Delivery
                  key={delivery.id}
                  delivery={delivery}
                  retrying={
                    retryDelivery.isPending &&
                    retryDelivery.variables === delivery.id
                  }
                  onRetry={() => retryDelivery.mutate(delivery.id)}
                />
              ))}
            </SettingsBox>
          )}
          {retryDelivery.error && (
            <p role="alert" className="text-sm text-error-ink">
              {describeError(retryDelivery.error)}
            </p>
          )}
          {deliveries.hasNextPage && (
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={deliveries.isFetchingNextPage}
                onClick={() => void deliveries.fetchNextPage()}
              >
                {deliveries.isFetchingNextPage ? 'Loading...' : 'Show older'}
              </Button>
            </div>
          )}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  )
}

function Delivery({
  delivery,
  retrying,
  onRetry,
}: {
  delivery: GithubDelivery
  retrying: boolean
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm">
          {delivery.event}
          {delivery.action ? ` ${delivery.action}` : ''}
          {delivery.repo && (
            <span className="text-ink-muted"> in {delivery.repo}</span>
          )}
        </span>
        <DeliveryBadge state={delivery.state} />
        {delivery.state === 'failed' && (
          <Button variant="outline" size="xs" disabled={retrying} onClick={onRetry}>
            {retrying ? 'Retrying...' : 'Retry'}
          </Button>
        )}
      </div>
      <p className="text-xs text-ink-muted">
        {ago(delivery.receivedAt)}
        {' · '}
        {delivery.attempts} {delivery.attempts === 1 ? 'attempt' : 'attempts'}
      </p>
      {delivery.error && (
        <p className="text-xs text-error-ink">{delivery.error}</p>
      )}
      {delivery.outcomes.length > 0 && (
        <ul className="text-xs text-ink-muted">
          {delivery.outcomes.map((outcome) => (
            <li key={outcome.consumer}>
              {outcome.consumer}: {outcome.state}
              {outcome.detail ? `, ${outcome.detail}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
