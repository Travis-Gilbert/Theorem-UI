// SOURCING: the settings frame's SettingsRow with ./parts' StatusBadge; the rows come from GET /api/connections/v1, which lists every first-party connection besides GitHub and the MCP servers this page manages
import { Icon } from '@/components/icons'
import {
  SettingsBox,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-frame'
import { useConnections } from '@/lib/theorem/connections'
import { StatusBadge, ago } from './parts'

/** The connections made elsewhere in Theorem (Google, for one), shown here as status only. */
export function OtherConnections() {
  const { data } = useConnections()
  const others = (data?.connections ?? []).filter(
    (connection) => connection.kind !== 'github' && connection.kind !== 'mcp',
  )
  if (others.length === 0) return null

  return (
    <SettingsSection
      title="Other connections"
      description="Connected where you set them up. This is their status; manage them there."
    >
      <SettingsBox>
        {others.map((connection) => (
          <SettingsRow
            key={connection.id}
            Mark={Icon.Link}
            title={connection.label}
            description={
              [
                connection.account?.label,
                connection.health.detail,
                ago(connection.lastEventAt) &&
                  `last activity ${ago(connection.lastEventAt)}`,
              ]
                .filter(Boolean)
                .join(', ') || undefined
            }
          >
            <StatusBadge status={connection.status} health={connection.health} />
          </SettingsRow>
        ))}
      </SettingsBox>
    </SettingsSection>
  )
}
