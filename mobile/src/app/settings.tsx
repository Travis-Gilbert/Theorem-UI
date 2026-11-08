// SOURCING: session.bootstrap (signed-in identity), remoteWorkspaces.list (execution workspaces), expo-constants (app version), react-native Alert and Switch; the theorem-session computers() and sessionSupport(); the Show terminal preference
import { Alert, Switch, View } from 'react-native'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { refreshComputers, useComputers } from '@/features/agents/computers'
import { signOut, useAuth } from '@/lib/auth'
import { config } from '@/lib/config'
import { setShowTerminal, useShowTerminal } from '@/lib/preferences'
import { describeError, theorem } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Row } from '@/ui/row'
import { Screen, Section } from '@/ui/screen'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme, type Preference } from '@/ui/theme'
import { computers, sessionSupport, type Computer } from '../../modules/theorem-session'

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
  const machines = useComputers()
  const showTerminal = useShowTerminal()
  const terminal = sessionSupport()

  const confirmRemove = (computer: Computer) =>
    Alert.alert(
      `Remove ${computer.name}?`,
      'This device forgets the computer, its host key and its sign-in. Claude Code, Codex and tmux keep running on it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            void computers()
              ?.remove(computer.id)
              .then(refreshComputers, (error: unknown) =>
                Alert.alert(`Could not remove ${computer.name}`, describeError(error)),
              ),
        },
      ],
    )

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
        <Row wrap title="Theorem" detail={host} />
        <Row
          wrap
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
          <Row
            wrap
            title="Development token"
            detail="This session uses a bearer pasted in a development build."
          />
        ) : null}
        <View style={{ padding: space.lg }}>
          <Button label="Sign out" variant="destructive" onPress={confirmSignOut} />
        </View>
      </Section>

      <Section title="Appearance">
        {appearances.map((item) => (
          <Row
            wrap
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
            wrap
            title="Could not load workspaces"
            detail={describeError(workspaces.error)}
            onPress={workspaces.reload}
          />
        ) : workspaces.data.length === 0 ? (
          <Row wrap title="None" detail="Theorem has no remote execution workspaces for this account." />
        ) : (
          workspaces.data.map((workspace) => (
            <Row
              wrap
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

      <Section title="Computers">
        {machines.status === 'unavailable' ? (
          <Row
            wrap
            title="Not available in this build"
            detail="Claude Code and Codex on your computers need a build with the native session feature."
          />
        ) : (
          <>
            {machines.status === 'failed' && machines.entries.length === 0 ? (
              <Row
                wrap
                title="Could not list computers"
                detail={describeError(machines.error)}
                onPress={refreshComputers}
              />
            ) : null}
            {machines.entries.map(({ computer }) => (
              <Row
                wrap
                key={computer.id}
                title={computer.name}
                detail={`${computer.username}@${computer.host}${computer.port === 22 ? '' : `:${computer.port}`}`}
                accessibilityHint="Offers to remove this computer from the device"
                onPress={() => confirmRemove(computer)}
              />
            ))}
            {machines.status !== 'loading' && machines.entries.length === 0 ? (
              <Row
                wrap
                title="None yet"
                detail="Add a computer you reach over SSH to talk to Claude Code or Codex running on it."
              />
            ) : null}
            <View style={{ padding: space.lg }}>
              <Button label="Add a computer" onPress={() => router.push('/computer')} />
            </View>
          </>
        )}
      </Section>

      <Section title="Terminal">
        <Row
          wrap
          title="Show terminal"
          detail={
            terminal.available
              ? showTerminal
                ? 'A Terminal button on Claude Code and Codex conversations opens the tmux session behind them.'
                : 'Off: Claude Code and Codex read as chat, and the terminal behind them stays hidden.'
              : terminal.reason
          }
          trailing={
            <Switch
              accessibilityLabel="Show terminal"
              value={showTerminal && terminal.available}
              disabled={!terminal.available}
              onValueChange={setShowTerminal}
            />
          }
        />
      </Section>

      <Section title="Notifications">
        <Row
          wrap
          title="Not available yet"
          detail="Push notifications arrive with the durable inbox. Open conversations still update while the app is open."
        />
      </Section>

      <Section title="About">
        <Row wrap title="Version" detail={Constants.expoConfig?.version ?? 'unknown'} />
      </Section>
    </Screen>
  )
}
