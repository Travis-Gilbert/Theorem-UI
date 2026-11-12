// SOURCING: ./conversation-surface over useConversation (HeadlessConversation through assistant-ui's external store); expo-router Stack.Screen header
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { Stack } from 'expo-router'
import type { ConversationPhase } from '@theoremharness/sdk'
import { describeError, statusOf } from '@/lib/theorem'
import { Button } from '@/ui/button'
import { ShareButton } from '@/ui/header'
import { useTheme } from '@/ui/theme'
import { Unavailable } from '@/ui/unavailable'
import { rememberLastThread } from '../invocation/handler'
import { useTaskPresence } from '../presence/use-task-presence'
import { ConversationSurface, EmptyConversation, type SurfaceNote } from './conversation-surface'
import { conversations, useConversation } from './runtime'
import { threadTitle } from './threads'

/** Phases worth a line in the composer; running and ready speak through Stop and Send. */
const phases: Partial<Record<ConversationPhase, Omit<SurfaceNote, 'action'>>> = {
  detached: { tone: 'muted', text: 'Not connected to Theorem.' },
  connecting: { tone: 'muted', text: 'Connecting to Theorem…' },
  'requires-action': { tone: 'attention', text: 'Theorem is waiting on you. Answer the request above.' },
  reconnecting: { tone: 'attention', text: 'Reconnecting. The run continues on Theorem.' },
  'authentication-required': { tone: 'error', text: 'Sign in again to continue.' },
  failed: { tone: 'error', text: 'The connection to Theorem failed.' },
  cancelled: { tone: 'muted', text: 'Run stopped.' },
  interrupted: { tone: 'error', text: 'The run was interrupted.' },
}

/**
 * One Theorem conversation. `titled` sets the navigation title from the
 * thread; the iPad split leaves the list's title alone. `onLeave` is where the
 * person goes when this thread is gone or not theirs; another conversation is
 * never opened in its place.
 */
export function ConversationPane({
  threadId,
  titled,
  onLeave,
}: {
  threadId: string
  titled?: boolean
  onLeave: () => void
}) {
  const { palette } = useTheme()
  const { runtime, state, sendError } = useConversation(threadId)
  useTaskPresence(threadId, state)
  // "Continue the conversation" from a Shortcut or the Action button opens this one.
  useEffect(() => rememberLastThread(threadId), [threadId])
  const title = state.snapshot ? threadTitle(state.snapshot.thread) : 'Conversation'
  const status = state.phase === 'failed' ? statusOf(state.error) : undefined
  if (status === 404 || status === 403)
    return (
      <View style={[styles.fill, { backgroundColor: palette.neutral }]}>
        {titled ? <Stack.Screen options={{ title: 'Conversation' }} /> : null}
        <Unavailable
          title={
            status === 404 ? 'This conversation no longer exists' : 'This conversation is not yours to open'
          }
          reason={
            status === 404
              ? 'Theorem has no thread with this link. It may have been deleted on another device.'
              : 'Theorem refused this thread for the signed-in account. Check which account you are using in Settings.'
          }
        >
          <Button label="Back to conversations" variant="primary" onPress={onLeave} />
        </Unavailable>
      </View>
    )

  const notes: SurfaceNote[] = []
  const phase = phases[state.phase]
  if (phase)
    notes.push({
      ...phase,
      text: state.phase === 'failed' ? `${phase.text} ${describeError(state.error)}` : phase.text,
      action:
        state.phase === 'failed' ? { label: 'Reconnect', onPress: () => conversations().reconnect(threadId) } : undefined,
    })
  if (sendError) notes.push({ tone: 'error', text: describeError(sendError) })

  return (
    <>
      {titled ? (
        <Stack.Screen options={{ title, headerRight: () => <ShareButton threadId={threadId} /> }} />
      ) : null}
      <ConversationSurface
        runtime={runtime}
        recipient={{ name: 'Theorem', detail: state.snapshot?.project.title }}
        placeholder="Reply to Theorem"
        notes={notes}
        empty={<EmptyConversation title="Theorem" detail="Ask anything about this project." />}
        stopLabel="Stop the run"
        controls={titled ? undefined : <ShareButton threadId={threadId} />}
      />
    </>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
