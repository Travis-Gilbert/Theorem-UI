// SOURCING: @tanstack/react-router file route over the settings frame; the sections are components/connections (GitHub, MCP servers, other connections)
import { createFileRoute } from '@tanstack/react-router'
import { GithubSection } from '@/components/connections/github-card'
import { McpServers } from '@/components/connections/mcp-servers'
import { OtherConnections } from '@/components/connections/other-connections'
import { SettingsPage } from '@/components/settings/settings-frame'

export const Route = createFileRoute('/settings/connections')({
  component: ConnectionsSettings,
})

function ConnectionsSettings() {
  return (
    <SettingsPage
      title="Connections"
      description="The accounts and tool servers your agent can reach. Theorem holds their credentials and makes the requests; you choose what each conversation may use from the composer."
    >
      <GithubSection />
      <McpServers />
      <OtherConnections />
    </SettingsPage>
  )
}
