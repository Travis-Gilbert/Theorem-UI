// SOURCING: coss ui Empty and the app's Skeleton; @tanstack/react-router Link to the setting that turns the tracker on; ./settings (the persisted switches) so a tracker that is off opens no work request and no event stream
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/coss/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { describeError } from '@/lib/theorem/client'
import { useWorkEvents } from './events'
import { useWorkTracker } from './settings'

/** Opens the live stream for as long as the tracker is on; mounted only inside the gate. */
function Live({ children }: { children: ReactNode }) {
  useWorkEvents()
  return children
}

/** The short state a direct link shows while the tracker is off. */
export function WorkOff({ served = true }: { served?: boolean }) {
  return (
    <Empty className="rounded-lg border border-separator">
      <EmptyHeader>
        <EmptyTitle>Work tracker is off</EmptyTitle>
        <EmptyDescription>
          {served ? (
            <>
              Turn it on in{' '}
              <Link to="/settings/work" className="text-link underline-offset-2 hover:underline">
                Settings, Work
              </Link>{' '}
              to see issues, pull requests and your inbox here.
            </>
          ) : (
            'This Theorem does not serve the work tracker.'
          )}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

/**
 * Renders `children` only while the tracker is on. Everything under it reads
 * and listens through the work source, so with the tracker off none of it
 * mounts: no request, no event stream.
 */
export function WorkGate({ children }: { children: ReactNode }) {
  const tracker = useWorkTracker()
  switch (tracker.state) {
    case 'loading':
      return <Skeleton className="h-40 w-full rounded-lg" />
    case 'off':
      return <WorkOff served={tracker.served} />
    case 'error':
      return (
        <Empty className="rounded-lg border border-separator">
          <EmptyHeader>
            <EmptyTitle>Work did not load</EmptyTitle>
            <EmptyDescription>{describeError(tracker.error)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )
    case 'on':
      return <Live>{children}</Live>
  }
}
