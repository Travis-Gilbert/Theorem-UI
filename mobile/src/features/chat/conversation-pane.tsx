// SOURCING: ./conversation-surface over useConversation (HeadlessConversation through assistant-ui's external store); expo-router Stack.Screen header
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { Stack } from 'expo-router'
import { describeError, statusOf } from '@/lib/theorem'
import { Button } from '@/ui/button'
import { ShareButton } from '@/ui/header'
import { useTheme } from '@/ui/theme'
import { Unavailable } from '@/ui/unavailable'
import { useDeliveries } from '../intake/queue'
import { rememberLastThread } from '../invocation/handler'
import { useTaskPresence } from '../presence/use-task-presence'
import { ConversationSurface, EmptyConversation, type SurfaceNote } from './conversation-surface'
import { connectionNotice } from './recovery'
import { useConversation } from './runtime'
import { threadTitle } from './threads'

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
  const { runtime, state, sendError, queued, paused, removeQueued, editQueued, recover, recoveryError } =
    useConversation(threadId)
  useTaskPresence(threadId, state)
  // The newest delivery the person made to this conversation: Theo says what became of it.
  const delivery = useDeliveries()
    .filter((entry) => entry.receiver.threadId === threadId)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)[0]
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
  const notice = connectionNotice(state, describeError)
  if (notice) {
    const { action } = notice
    notes.push({
      tone: notice.tone,
      text: notice.text,
      details: [notice.details, recoveryError ? describeError(recoveryError) : undefined].filter(Boolean).join('\n') || undefined,
      action: action ? { label: action.label, onPress: () => void recover(action.recovery) } : undefined,
    })
  }
  if (sendError) notes.push({ tone: 'error', text: "That message wasn't sent. Your words are back in the box.", details: describeError(sendError) })

  return (
    <>
      {titled ? (
        <Stack.Screen options={{ title, headerRight: () => <ShareButton threadId={threadId} /> }} />
      ) : null}
      <ConversationSurface
        runtime={runtime}
        recipient={{ name: 'Theo', detail: state.snapshot?.project.title }}
        placeholder="Reply to Theo"
        notes={notes}
        theo={{ conversation: state, delivery }}
        queue={{ items: queued, paused, onRemove: removeQueued, onEdit: editQueued }}
        empty={<EmptyConversation title="Theorem" detail="Ask anything about this project." />}
        stopLabel="Stop the run"
        controls={titled ? undefined : <ShareButton threadId={threadId} />}
      />
    </>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
