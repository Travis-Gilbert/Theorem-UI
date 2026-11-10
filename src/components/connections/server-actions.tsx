// SOURCING: coss ui Input and Button over lib/theorem/connections' mutations; the OAuth hand-off follows program/life-panel's connector connect (POST connect with returnTo, then follow authorizationUrl)
import { useState } from 'react'
import { Input } from '@/components/coss/input'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import { useMcpMutations } from '@/lib/theorem/connections'
import type { McpServer, McpTestResult } from '@/lib/theorem/connections'
import { serverHint } from './parts'

type Mutations = ReturnType<typeof useMcpMutations>

/** Starts a server's sign-in and follows it; a backend that cannot yet says why, on the server. */
export function ConnectButton({
  server,
  connect,
}: {
  server: McpServer
  connect: Mutations['connect']
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={connect.isPending}
      onClick={() =>
        connect.mutate(
          { id: server.id, returnTo: location.pathname + location.search },
          { onSuccess: ({ authorizationUrl }) => location.assign(authorizationUrl) },
        )
      }
    >
      {connect.isPending
        ? 'Opening sign-in...'
        : server.status === 'connected'
          ? 'Sign in again'
          : 'Connect'}
    </Button>
  )
}

/**
 * The instruction for a server that is not working, with the one action that
 * fixes it where there is one. A server whose sign-in cannot be started says
 * what the backend said, rather than leaving a button that does nothing.
 */
export function ServerNotice({
  server,
  className,
}: {
  server: McpServer
  className?: string
}) {
  const { connect } = useMcpMutations()
  const hint = serverHint(server)
  if (!hint) return null
  return (
    <div className={className}>
      <p className="text-xs text-warning-foreground">{hint}</p>
      {server.auth.type === 'oauth' && server.status === 'needs_auth' && (
        <div className="mt-2 flex items-center gap-2">
          <ConnectButton server={server} connect={connect} />
        </div>
      )}
      {connect.error && (
        <p role="alert" className="mt-2 text-xs text-error-ink">
          {describeError(connect.error)}
        </p>
      )}
    </div>
  )
}

/** The outcome of a connection test, in one line. */
export function TestOutcome({
  pending,
  result,
  error,
}: {
  pending: boolean
  result: McpTestResult | undefined
  error: unknown
}) {
  if (pending)
    return <p className="text-xs text-ink-muted">Testing the connection...</p>
  if (error)
    return (
      <p role="alert" className="text-xs text-error-ink">
        {describeError(error)}
      </p>
    )
  if (!result) return null
  if (!result.ok)
    return (
      <p role="alert" className="text-xs text-error-ink">
        {result.error ?? 'The server did not answer.'}
      </p>
    )
  const facts = [
    result.latencyMs !== undefined && `${Math.round(result.latencyMs)} ms`,
    result.toolCount !== undefined &&
      `${result.toolCount} ${result.toolCount === 1 ? 'tool' : 'tools'}`,
  ].filter(Boolean)
  return (
    <p role="status" className="text-xs text-success-foreground">
      Connection works{facts.length > 0 ? `: ${facts.join(', ')}` : ''}.
    </p>
  )
}

/** Replaces a bearer token, then tests it. The stored one is never shown. */
export function TokenReplace({ server }: { server: McpServer }) {
  const { update, test } = useMcpMutations()
  const [token, setToken] = useState('')
  const trimmed = token.trim()
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        update.mutate(
          { id: server.id, patch: { auth: { type: 'bearer', token: trimmed } } },
          {
            onSuccess: () => {
              setToken('')
              test.mutate(server.id)
            },
          },
        )
      }}
    >
      <div className="flex gap-2">
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label={`New token for ${server.label}`}
          placeholder={server.auth.configured ? 'New token' : 'Token'}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="flex-1 font-mono"
        />
        <Button
          type="submit"
          size="sm"
          className="h-9"
          disabled={!trimmed || update.isPending}
        >
          {update.isPending ? 'Saving...' : 'Replace token'}
        </Button>
      </div>
      {update.error && (
        <p role="alert" className="text-xs text-error-ink">
          {describeError(update.error)}
        </p>
      )}
      <TestOutcome
        pending={test.isPending}
        result={test.data}
        error={test.error}
      />
    </form>
  )
}
