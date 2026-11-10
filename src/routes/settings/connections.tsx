// SOURCING: @tanstack/react-router file route (validateSearch for what Theorem appends after a sign-in) over the settings frame; the sections are components/connections (GitHub, MCP servers, other connections)
import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  ConnectionReturn,
  FinishingSignIn,
  readOutcome,
  readPending,
} from '@/components/connections/connection-return'
import type { ConnectionOutcome } from '@/components/connections/connection-return'
import { GithubSection } from '@/components/connections/github-card'
import { McpServers } from '@/components/connections/mcp-servers'
import { OtherConnections } from '@/components/connections/other-connections'
import { SettingsPage } from '@/components/settings/settings-frame'
import { connectionKeys } from '@/lib/theorem/connections'

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

export const Route = createFileRoute('/settings/connections')({
  // Theorem returns the person here after a sign-in with how it ended.
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    connector?: string
    connection?: string
    reason?: string
    completion?: string
  } => ({
    connector: text(search.connector),
    connection: text(search.connection),
    reason: text(search.reason),
    completion: text(search.completion),
  }),
  component: ConnectionsSettings,
})

function ConnectionsSettings() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const client = useQueryClient()
  // Read once, on arrival: the address is cleaned below, the notice stays.
  const [outcome, setOutcome] = useState(() => readOutcome(search))
  // A sign-in the server answered, which this page still has to finish.
  const [pending, setPending] = useState(() => readPending(search))
  const arrived = Boolean(search.connector)
  useEffect(() => {
    if (!arrived) return
    // What was cached before the sign-in is out of date now, and the address
    // must not keep the one-time token.
    void client.invalidateQueries({ queryKey: connectionKeys.all })
    void navigate({ search: {}, replace: true })
  }, [arrived, client, navigate])
  const finished = useCallback(
    (ended: ConnectionOutcome) => {
      setPending(undefined)
      setOutcome(ended)
      void client.invalidateQueries({ queryKey: connectionKeys.all })
    },
    [client],
  )

  return (
    <SettingsPage
      title="Connections"
      description="The accounts and tool servers your agent can reach. Theorem holds their credentials and makes the requests; you choose what each conversation may use from the composer."
    >
      {pending && <FinishingSignIn pending={pending} onDone={finished} />}
      {outcome && (
        <ConnectionReturn
          outcome={outcome}
          onDismiss={() => setOutcome(undefined)}
        />
      )}
      <GithubSection />
      <McpServers />
      <OtherConnections />
    </SettingsPage>
  )
}
