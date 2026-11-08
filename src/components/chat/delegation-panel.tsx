// SOURCING: DelegationBody (the card's own record, in detailed form), assistant-ui ReadonlyThreadProvider with ThreadPrimitive.ViewportProvider, ThreadPrimitive.Messages and MessagePrimitive.Root (a specialist's run renders as a read-only thread inside the conversation's runtime, so the conversation's tool and data renderers apply), the thread's AssistantMessageContent, useSpecialistRun (the run's events through react-query streamedQuery)
import {
  MessagePrimitive,
  ReadonlyThreadProvider,
  ThreadPrimitive,
} from '@assistant-ui/react'
import type { FC } from 'react'
import { AssistantMessageContent } from '@/components/assistant-ui/elements/thread.aui'
import { ShimmerLabel } from '@/components/assistant-ui/elements/surfaces'
import {
  LIVE_DELEGATION_STATES,
  useSpecialistRun,
  useThreadDelegation,
} from '@/lib/theorem/delegations'
import type { DelegationPart } from '@/lib/theorem/delegations'
import { DelegationBody } from './delegation-parts'

const SpecialistMessage: FC = () => (
  <MessagePrimitive.Root className="py-2">
    <AssistantMessageContent />
  </MessagePrimitive.Root>
)

/** What the specialist said and did in its own run, followed while it goes on. */
const SpecialistRun: FC<{ delegation: DelegationPart }> = ({ delegation }) => {
  const { message, error } = useSpecialistRun(delegation.childRunId)
  if (error)
    return (
      <p role="alert" className="px-4 text-xs text-error-ink">
        {error.message}
      </p>
    )
  if (!message)
    return LIVE_DELEGATION_STATES.has(delegation.state) ? (
      <ShimmerLabel className="block px-4 text-xs text-ink-faint">
        Waiting for the {delegation.roleLabel.toLowerCase()} to start
      </ShimmerLabel>
    ) : (
      <p className="px-4 text-xs text-ink-faint">The run left no messages.</p>
    )
  // The panel scrolls the receipt and the run together, so the run takes the
  // viewport's store without its scroller.
  return (
    <ReadonlyThreadProvider messages={[message]}>
      <ThreadPrimitive.ViewportProvider>
        <ThreadPrimitive.Messages>
          {() => <SpecialistMessage />}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.ViewportProvider>
    </ReadonlyThreadProvider>
  )
}

/**
 * A delegation in the dock: its full record, with each check's output and the
 * specialist's assumptions, then the specialist's own run.
 */
export const DelegationPanel: FC<{ delegationId: string }> = ({
  delegationId,
}) => {
  const delegation = useThreadDelegation(delegationId)
  if (!delegation)
    return (
      <div className="flex h-full items-center justify-center bg-artifact px-6 text-center text-sm text-ink-muted">
        This delegation is not part of this conversation.
      </div>
    )
  return (
    <div
      data-slot="theorem-delegation-panel"
      className="h-full overflow-y-auto bg-artifact"
    >
      <article className="flex flex-col">
        <DelegationBody delegation={delegation} detailed />
      </article>
      <section className="border-t border-separator pt-3 pb-6">
        <h3 className="px-4 pb-1 text-xs font-medium text-ink-muted">
          Activity
        </h3>
        <SpecialistRun delegation={delegation} />
      </section>
    </div>
  )
}
