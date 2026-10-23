// SOURCING: lucide-react (the shield), the app's Button, and trust.ts, which
// trusts the folder through the local server and tells every open block. What
// an untrusted folder's block shows instead of running (plan D9).
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useFolderTrust } from '@/lib/blocks/trust'
import type { WorkspaceClient } from '@/lib/workspace/types'
import { BlockMessage } from './block-status'

/** Why a block does not run, the action that lets it, and its source. */
export function TrustGate({
  client,
  children,
}: {
  client: WorkspaceClient
  /** The block's source, shown as it is. */
  children?: ReactNode
}) {
  const { trust, pending, error } = useFolderTrust(client)
  return (
    <div data-slot="trust-gate" className="space-y-2 py-2">
      <div className="flex items-start gap-2 px-3 text-xs">
        <ShieldAlert
          className="mt-0.5 size-4 shrink-0 text-ink-muted"
          aria-hidden
        />
        <p className="text-ink-muted">
          <span className="font-medium text-ink">
            {client.workspace.name} is not trusted, so its blocks do not run.
          </span>{' '}
          Blocks are code. Trust a folder you made, or one from someone you
          trust.
        </p>
      </div>
      <div className="px-3">
        <Button
          variant="outline"
          size="xs"
          disabled={pending}
          onClick={() => void trust()}
        >
          <ShieldCheck />
          {pending ? 'Trusting…' : 'Trust this folder'}
        </Button>
      </div>
      {error && <BlockMessage tone="error">{error}</BlockMessage>}
      {children}
    </div>
  )
}
