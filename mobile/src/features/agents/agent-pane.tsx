// SOURCING: ../chat/conversation-surface over useAgentConversation; the theorem-session computers() trustHostKey; expo-router Stack.Screen and router
//
// A Claude Code or Codex conversation on a computer. It reads as chat; the
// terminal behind it shows only for the person who turned on Show terminal.
// Every state that stops the person from sending says why, in the composer.
import { useState } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { router, Stack } from 'expo-router'
import { describeError } from '@/lib/theorem'
import { useShowTerminal } from '@/lib/preferences'
import { radius, space } from '@/theme/tokens'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { computers } from '../../../modules/theorem-session'
import { ConversationSurface, EmptyConversation, type SurfaceNote } from '../chat/conversation-surface'
import { computerById } from './computers'
import { folderName } from './discovery'
import { HostKeyError } from './remote'
import { useAgentConversation, type AgentTarget } from './runtime'
import { agentName } from './shell'

export function AgentPane({ target, titled }: { target: AgentTarget; titled?: boolean }) {
  const { palette } = useTheme()
  const view = useAgentConversation(target)
  const showTerminal = useShowTerminal()
  const [trusting, setTrusting] = useState(false)
  const name = agentName[target.agent]
  const computer = computerById(target.computerId)
  const computerName = computer?.name ?? 'the computer'
  const folder = folderName(view.transcript.cwd)
  const pane = view.liveness?.kind === 'live' ? view.liveness.pane : undefined

  const openTerminal = pane
    ? () => router.push({ pathname: '/terminal', params: { computer: target.computerId, session: pane.session } })
    : undefined

  const notes: SurfaceNote[] = []
  const { error } = view
  if (error instanceof HostKeyError) {
    const { challenge } = error
    notes.push({
      tone: challenge.kind === 'changed' ? 'error' : 'attention',
      text:
        challenge.kind === 'changed'
          ? `${challenge.host} now presents a different host key (${challenge.keyType} ${challenge.fingerprint}). Someone may be intercepting the connection. Trust it only if you changed the computer's key.`
          : `${challenge.host} is not trusted on this device yet. Its key is ${challenge.keyType} ${challenge.fingerprint}. Trust it if this matches the computer's key.`,
      action: {
        label: trusting ? 'Trusting…' : 'Trust',
        onPress: async () => {
          setTrusting(true)
          try {
            await computers()?.trustHostKey(error.computerId, challenge.fingerprint)
            view.retry()
          } finally {
            setTrusting(false)
          }
        },
      },
    })
  } else if (error) {
    notes.push({ tone: 'error', text: describeError(error), action: { label: 'Try again', onPress: view.retry } })
  } else if (view.reading === 'loading') {
    notes.push({ tone: 'muted', text: `Reading the conversation on ${computerName}…` })
  } else if (view.reading === 'missing') {
    notes.push({ tone: 'muted', text: `This log is no longer on ${computerName}.` })
  } else if (view.liveness?.kind === 'ambiguous') {
    notes.push({
      tone: 'attention',
      text: `${view.liveness.panes.length} terminals run ${name} in this folder, so Theorem cannot tell which one to type into. You can read here; reply in the terminal.`,
    })
  } else if (view.liveness?.kind === 'ended') {
    notes.push({
      tone: 'muted',
      text: view.tmux
        ? `This ${name} session has ended. Start a new conversation to keep working.`
        : `${computerName} has no tmux, so Theorem can read ${name} here but not reply.`,
    })
  }
  if (view.waitingOnTerminal)
    notes.push({
      tone: 'attention',
      text: showTerminal
        ? `${name} may be asking for permission in the terminal.`
        : `${name} may be asking for permission in the terminal. Turn on Show terminal in Settings to answer it.`,
      action: showTerminal && openTerminal ? { label: 'Open terminal', onPress: openTerminal } : undefined,
    })
  if (view.sendError) notes.push({ tone: 'error', text: describeError(view.sendError) })

  return (
    <>
      {titled ? <Stack.Screen options={{ title: view.transcript.title ?? name }} /> : null}
      <ConversationSurface
        runtime={view.runtime}
        recipient={{ name, detail: [computerName, folder].filter(Boolean).join(' · ') }}
        placeholder={`Reply to ${name}`}
        notes={notes}
        sendBlocked={!pane}
        stopLabel={`Interrupt ${name}`}
        header={
          view.startedMidway ? (
            <Text variant="label" tone="faint">
              Earlier messages are in the log on {computerName}.
            </Text>
          ) : undefined
        }
        empty={
          <EmptyConversation
            title={name}
            detail={view.reading === 'loading' ? undefined : `Nothing in this conversation yet.`}
          />
        }
        controls={
          showTerminal && openTerminal ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show the terminal running ${name}`}
              onPress={openTerminal}
              hitSlop={6}
              style={({ pressed }) => [
                styles.terminal,
                { backgroundColor: pressed ? palette.hover : palette.neutral },
              ]}
            >
              <Text variant="label">Terminal</Text>
            </Pressable>
          ) : undefined
        }
      />
    </>
  )
}

const styles = StyleSheet.create({
  terminal: {
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
})
