// SOURCING: session.bootstrap (signed-in identity), remoteWorkspaces.list (execution workspaces), expo-constants (app version), react-native Alert
import { Alert, View } from 'react-native'
import Constants from 'expo-constants'
import { signOut, useAuth } from '@/lib/auth'
import { config } from '@/lib/config'
import { describeError, theorem } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Row } from '@/ui/row'
import { Screen, Section } from '@/ui/screen'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme, type Preference } from '@/ui/theme'

const appearances: Array<{ id: Preference; label: string }> = [
  { id: 'system', label: 'Match the system' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

export default function SettingsScreen() {
  const auth = useAuth()
  const { preference, setPreference } = useTheme()
  const identity = useRequest(() => theorem().session.bootstrap(), [])
  const workspaces = useRequest(() => theorem().remoteWorkspaces.list(), [])
  const host = new URL(config.authority).host

  const confirmSignOut = () =>
    Alert.alert(
      'Sign out of Theorem?',
      'Runs keep going on Theorem. This device forgets your session, drafts and saved conversation progress.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
      ],
    )

  return (
    <Screen scroll>
      <Section title="Account">
        <Row title="Theorem" detail={host} />
        <Row
          title="Signed in as"
          detail={
            identity.status === 'ready'
              ? `Principal ${identity.data.principalId} · tenant ${identity.data.tenantId}`
              : identity.status === 'failed'
                ? describeError(identity.error)
                : 'Checking…'
          }
        />
        {auth.status === 'signed-in' && auth.kind === 'token' ? (
          <Row title="Development token" detail="This session uses a bearer pasted in a development build." />
        ) : null}
        <View style={{ padding: space.lg }}>
          <Button label="Sign out" variant="destructive" onPress={confirmSignOut} />
        </View>
      </Section>

      <Section title="Appearance">
        {appearances.map((item) => (
          <Row
            key={item.id}
            title={item.label}
            selected={preference === item.id}
            trailing={preference === item.id ? <Text tone="accent">✓</Text> : undefined}
            onPress={() => setPreference(item.id)}
          />
        ))}
      </Section>

      <Section title="Execution workspaces">
        {workspaces.status === 'loading' ? (
          <View style={{ padding: space.lg }}>
            <StatusLabel tone="live" label="Loading" />
          </View>
        ) : workspaces.status === 'failed' ? (
          <Row
            title="Could not load workspaces"
            detail={describeError(workspaces.error)}
            onPress={workspaces.reload}
          />
        ) : workspaces.data.length === 0 ? (
          <Row title="None" detail="Theorem has no remote execution workspaces for this account." />
        ) : (
          workspaces.data.map((workspace) => (
            <Row
              key={workspace.workspace_id}
              title={workspace.workspace_id}
              detail={[
                workspace.active ? 'Active' : 'Idle',
                workspace.durable ? 'durable' : 'temporary',
              ].join(' · ')}
            />
          ))
        )}
      </Section>

      <Section title="Paired computers">
        <Row
          title="Not available yet"
          detail="Pairing a computer for Claude Code, Codex or Platinum needs a pairing service Theorem does not provide yet."
        />
      </Section>

      <Section title="Notifications">
        <Row
          title="Not available yet"
          detail="Push notifications arrive with the durable inbox. Open conversations still update while the app is open."
        />
      </Section>

      <Section title="About">
        <Row title="Version" detail={Constants.expoConfig?.version ?? 'unknown'} />
      </Section>
    </Screen>
  )
}
