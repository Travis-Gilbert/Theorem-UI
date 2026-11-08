// SOURCING: theorem-session TheoremTerminalView (Remux's terminal for one tmux session over its SSH pool); expo-router Stack.Screen header
//
// The terminal behind a Claude Code or Codex conversation, for the person who
// turned on Show terminal in Settings. Done detaches this device; the agent
// and its tmux session keep running on the computer.
import { Pressable, StyleSheet, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { computerById } from '@/features/agents/computers'
import { useShowTerminal } from '@/lib/preferences'
import { Screen } from '@/ui/screen'
import { Text } from '@/ui/text'
import { Unavailable } from '@/ui/unavailable'
import { sessionSupport, TheoremTerminalView } from '../../modules/theorem-session'

export default function TerminalScreen() {
  const { computer, session } = useLocalSearchParams<{ computer?: string; session?: string }>()
  const showTerminal = useShowTerminal()
  const support = sessionSupport()
  const computerName = computer ? computerById(computer)?.name : undefined

  const body = !support.available ? (
    <Unavailable title="The terminal is not available in this build" reason={support.reason} />
  ) : !showTerminal ? (
    <Unavailable
      title="Show terminal is off"
      reason="Turn on Show terminal in Settings to see the terminal behind a conversation."
    />
  ) : !computer || !session ? (
    <Unavailable title="This link does not name a terminal" reason="A terminal needs its computer and its tmux session." />
  ) : undefined

  return (
    <>
      <Stack.Screen
        options={{
          title: computerName ? `${session} · ${computerName}` : (session ?? 'Terminal'),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              accessibilityHint="Closes the terminal; the session keeps running on the computer"
              hitSlop={12}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/chat'))}
            >
              <Text variant="strong" tone="accent">
                Done
              </Text>
            </Pressable>
          ),
        }}
      />
      {body || !computer || !session ? (
        <Screen scroll>{body}</Screen>
      ) : (
        <View style={styles.fill}>
          <TheoremTerminalView style={styles.fill} computerId={computer} session={session} />
        </View>
      )}
    </>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
