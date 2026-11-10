// SOURCING: coss ui Alert and Button over lib/theorem/connections' list query; the wording for each outcome Theorem sends back after a sign-in is Theorem's own, so it lives here once
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/coss/alert'
import { Button } from '@/components/ui/button'
import { useConnections } from '@/lib/theorem/connections'

/** What Theorem appends to the page it returns the person to after a sign-in. */
export type ConnectionOutcome = {
  /** "github", "google_gmail", "mcp:<id>", ... */
  connector: string
  result: 'connected' | 'error'
  /** A problem code, when the sign-in did not finish. */
  reason?: string
}

/** Reads the outcome from the page's search parameters; nothing when it has none. */
export function readOutcome(search: {
  connector?: string
  connection?: string
  reason?: string
}): ConnectionOutcome | undefined {
  if (!search.connector) return undefined
  if (search.connection !== 'connected' && search.connection !== 'error')
    return undefined
  return {
    connector: search.connector,
    result: search.connection,
    reason: search.reason,
  }
}

const REASONS: Record<string, string> = {
  mcp_authorization_denied:
    'The sign-in was not approved. Connect again when you are ready.',
  mcp_authorization_expired:
    'The sign-in took longer than ten minutes. Connect again to start a new one.',
  mcp_authorization_used:
    'That sign-in was already finished once. Connect again to start a new one.',
  mcp_authorization_unknown:
    'Theorem did not recognise that sign-in. Connect again to start a new one.',
  mcp_oauth_token_failed:
    'The server approved the sign-in but did not hand over access. Try again, or check the server.',
  mcp_oauth_discovery_failed:
    'Theorem could not read how this server signs people in.',
  mcp_oauth_registration_failed:
    'The server did not let Theorem register to sign people in.',
  mcp_oauth_unsupported:
    'This server does not offer a sign-in Theorem can use. Edit it to use a token instead.',
  mcp_auth_not_oauth:
    'This server is no longer set to use sign-in. Edit it, then connect again.',
  mcp_server_not_found: 'That server has been removed.',
}

/** The sentence under the title, for a sign-in that did not finish. */
export const reasonText = (reason: string | undefined) =>
  reason
    ? (REASONS[reason] ?? `Theorem reported: ${reason}.`)
    : 'Theorem did not say why. Try connecting again.'

/**
 * Says how a sign-in ended, once, at the top of the page the person was
 * returned to. The name is the connection's own label where the list has it.
 */
export function ConnectionReturn({
  outcome,
  onDismiss,
}: {
  outcome: ConnectionOutcome
  onDismiss: () => void
}) {
  const list = useConnections()
  const name =
    list.data?.connections.find((entry) => entry.id === outcome.connector)
      ?.label ?? (outcome.connector === 'github' ? 'GitHub' : 'The server')
  const connected = outcome.result === 'connected'
  return (
    <Alert variant={connected ? 'success' : 'error'} role="status">
      <AlertTitle>
        {connected ? `${name} is connected` : `${name} was not connected`}
      </AlertTitle>
      <AlertDescription>
        {connected
          ? 'Your agent can use it in the conversations where you turn it on.'
          : reasonText(outcome.reason)}
      </AlertDescription>
      <AlertAction>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </AlertAction>
    </Alert>
  )
}
