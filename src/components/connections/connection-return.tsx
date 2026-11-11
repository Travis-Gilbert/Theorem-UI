// SOURCING: coss ui Alert and Button over lib/theorem/connections' list query; the wording for each outcome Theorem sends back after a sign-in is Theorem's own, so it lives here once
import { useEffect, useRef } from 'react'
import { TheoremError } from '@theoremharness/sdk'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/coss/alert'
import { Button } from '@/components/ui/button'
import { connectionsApi, useConnections } from '@/lib/theorem/connections'

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

/**
 * A sign-in the server answered but Theorem has not finished: it finishes
 * only when the signed-in app asks, so that an approval given in one
 * person's browser cannot land on another person's connection.
 */
export type PendingSignIn = {
  connector: string
  /** The one-time token Theorem put on the address; sent back once. */
  completion: string
}

/** Reads a sign-in waiting to be finished; nothing when the address has none. */
export function readPending(search: {
  connector?: string
  connection?: string
  completion?: string
}): PendingSignIn | undefined {
  if (!search.connector || search.connection !== 'pending') return undefined
  if (!search.completion) return undefined
  return { connector: search.connector, completion: search.completion }
}

const OTHER_ACCOUNT =
  'That sign-in was started from a different Theorem account, so it was not finished here. Connect again from this account.'
const EXPIRED =
  'The sign-in was not finished in time. Connect again to start a new one.'
const USED =
  'That sign-in was already finished once. Connect again to start a new one.'
const UNKNOWN =
  'Theorem did not recognise that sign-in. Connect again to start a new one.'
const UNCONFIGURED =
  'This Theorem has not been told its own address, so it cannot send you back after a sign-in. Whoever runs it needs to set that first.'

const REASONS: Record<string, string> = {
  mcp_authorization_other_account: OTHER_ACCOUNT,
  connector_authorization_other_account: OTHER_ACCOUNT,
  connector_authorization_provider_mismatch:
    'That sign-in was for a different account type than the one this page was returned for, so Theorem did not use it. Connect again.',
  connector_authorization_expired: EXPIRED,
  connector_authorization_used: USED,
  connector_authorization_unknown: UNKNOWN,
  connector_app_unconfigured: UNCONFIGURED,
  mcp_oauth_unconfigured: UNCONFIGURED,
  mcp_authorization_issuer_mismatch:
    'The answer came from a different sign-in service than the one this server named, so Theorem did not use it.',
  mcp_authorization_denied:
    'The sign-in was not approved. Connect again when you are ready.',
  mcp_authorization_expired: EXPIRED,
  mcp_authorization_used: USED,
  mcp_authorization_unknown: UNKNOWN,
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

/** The connection's own label where the list has it. */
function useConnectionName(connector: string) {
  const list = useConnections()
  return (
    list.data?.connections.find((entry) => entry.id === connector)?.label ??
    (connector === 'github'
      ? 'GitHub'
      : connector.startsWith('mcp:')
        ? 'The server'
        : 'The account')
  )
}

/** The problem code Theorem refused with, when it gave one. */
const problemCode = (error: unknown) => {
  if (!(error instanceof TheoremError)) return undefined
  const code = (error.body as { code?: unknown } | undefined)?.code
  return typeof code === 'string' ? code : undefined
}

/**
 * Finishes a sign-in the person was just returned from, once, and reports
 * how it ended. Shown in the notice's place while Theorem answers.
 */
export function FinishingSignIn({
  pending,
  onDone,
}: {
  pending: PendingSignIn
  onDone: (outcome: ConnectionOutcome) => void
}) {
  const name = useConnectionName(pending.connector)
  // The token is good once, and React runs an effect twice in development.
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    connectionsApi
      .completeSignIn(pending.connector, pending.completion)
      .then(
      (done) => onDone({ connector: done.connector, result: 'connected' }),
      (error: unknown) =>
        onDone({
          connector: pending.connector,
          result: 'error',
          reason: problemCode(error),
        }),
    )
  }, [pending, onDone])
  return (
    <Alert variant="info" role="status">
      <AlertTitle>Finishing the sign-in for {name}</AlertTitle>
      <AlertDescription>
        Theorem is checking the sign-in belongs to this account.
      </AlertDescription>
    </Alert>
  )
}

/**
 * Says how a sign-in ended, once, at the top of the page the person was
 * returned to.
 */
export function ConnectionReturn({
  outcome,
  onDismiss,
}: {
  outcome: ConnectionOutcome
  onDismiss: () => void
}) {
  const name = useConnectionName(outcome.connector)
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
