// SOURCING: @tanstack/react-router file route (validateSearch for what Theorem appends after a sign-in) over the settings frame; the sections are components/connections (GitHub, MCP servers, other connections)
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  ConnectionReturn,
  readOutcome,
} from '@/components/connections/connection-return'
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
  ): { connector?: string; connection?: string; reason?: string } => ({
    connector: text(search.connector),
    connection: text(search.connection),
    reason: text(search.reason),
  }),
  component: ConnectionsSettings,
})

function ConnectionsSettings() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const client = useQueryClient()
  // Read once, on arrival: the address is cleaned below, the notice stays.
  const [outcome, setOutcome] = useState(() => readOutcome(search))
  const arrived = Boolean(search.connector)
  useEffect(() => {
    if (!arrived) return
    // What was cached before the sign-in is out of date now.
    void client.invalidateQueries({ queryKey: connectionKeys.all })
    void navigate({ search: {}, replace: true })
  }, [arrived, client, navigate])

  return (
    <SettingsPage
      title="Connections"
      description="The accounts and tool servers your agent can reach. Theorem holds their credentials and makes the requests; you choose what each conversation may use from the composer."
    >
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
