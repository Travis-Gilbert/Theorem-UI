// SOURCING: @assistant-ui/react-native ThreadPrimitive (Root, MessagesFlatList), ComposerPrimitive (Input, Send, Cancel), AssistantRuntimeProvider
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native'
import { Stack } from 'expo-router'
import { useHeaderHeight } from 'expo-router/react-navigation'
import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react-native'
import type { ConversationPhase } from '@theoremharness/sdk'
import { describeError, statusOf } from '@/lib/theorem'
import { fonts, radius, space, touchTarget, type as typeScale } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { StatusLabel, type Tone } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { Unavailable } from '@/ui/unavailable'
import { MessageView } from './message-view'
import { conversations, useConversation } from './runtime'
import { threadTitle } from './threads'

const phases: Record<ConversationPhase, { tone: Tone; label: string } | undefined> = {
  detached: { tone: 'neutral', label: 'Not connected' },
  connecting: { tone: 'live', label: 'Connecting' },
  ready: undefined,
  running: { tone: 'live', label: 'Run in progress' },
  'requires-action': { tone: 'attention', label: 'Waiting on you' },
  reconnecting: { tone: 'attention', label: 'Reconnecting; the run continues on Theorem' },
  'authentication-required': { tone: 'error', label: 'Sign in again to continue' },
  failed: { tone: 'error', label: 'Connection failed' },
  completed: undefined,
  cancelled: { tone: 'neutral', label: 'Run stopped' },
  interrupted: { tone: 'error', label: 'Run interrupted' },
}

/**
 * One conversation. `titled` sets the navigation title from the thread; the
 * iPad split leaves the list's title alone. `onLeave` is where the person goes
 * when this thread is gone or not theirs; another conversation is never opened
 * in its place.
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
  const headerHeight = useHeaderHeight()
  const { runtime, state, sendError } = useConversation(threadId)
  const phase = phases[state.phase]
  const error = sendError ?? (state.phase === 'failed' ? state.error : undefined)
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
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {titled ? <Stack.Screen options={{ title }} /> : null}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <ThreadPrimitive.Root style={[styles.fill, { backgroundColor: palette.neutral }]}>
          {phase || error ? (
            <View style={[styles.banner, { borderBottomColor: palette.lineSeparator }]}>
              {phase ? <StatusLabel {...phase} /> : null}
              {error ? (
                <Text variant="label" tone="error" accessibilityRole="alert">
                  {describeError(error)}
                </Text>
              ) : null}
              {state.phase === 'failed' ? (
                <Button label="Reconnect" onPress={() => conversations().reconnect(threadId)} />
              ) : null}
            </View>
          ) : null}
          <ThreadPrimitive.MessagesFlatList
            style={styles.fill}
            contentContainerStyle={styles.list}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text tone="muted">Ask Theorem anything about this project.</Text>
              </View>
            }
          >
            {({ message }) => <MessageView message={message} />}
          </ThreadPrimitive.MessagesFlatList>
          <View
            style={[
              styles.composer,
              { backgroundColor: palette.composer, borderTopColor: palette.lineSeparator },
            ]}
          >
            <ComposerPrimitive.Input
              accessibilityLabel="Message Theorem"
              placeholder="Message Theorem"
              placeholderTextColor={palette.inkFaint}
              multiline
              submitMode="none"
              style={[
                styles.input,
                { color: palette.ink, borderColor: palette.lineControl, backgroundColor: palette.neutral },
              ]}
            />
            <AuiIf condition={(s) => !s.thread.isRunning}>
              <ComposerPrimitive.Send
                accessibilityRole="button"
                accessibilityLabel="Send"
                style={({ pressed }) => [
                  styles.action,
                  { backgroundColor: palette.accent, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text variant="strong" tone="onAccent">
                  Send
                </Text>
              </ComposerPrimitive.Send>
            </AuiIf>
            <AuiIf condition={(s) => s.thread.isRunning}>
              {/* Stop is the only control that cancels; leaving this screen does not. */}
              <ComposerPrimitive.Cancel
                accessibilityRole="button"
                accessibilityLabel="Stop the run"
                style={({ pressed }) => [
                  styles.action,
                  {
                    backgroundColor: palette.errorContainer,
                    borderColor: palette.errorInk,
                    borderWidth: StyleSheet.hairlineWidth,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text variant="strong" tone="error">
                  Stop
                </Text>
              </ComposerPrimitive.Cancel>
            </AuiIf>
          </View>
        </ThreadPrimitive.Root>
      </KeyboardAvoidingView>
    </AssistantRuntimeProvider>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { paddingVertical: space.md },
  banner: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: { padding: space.xl, alignItems: 'center' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: touchTarget,
    maxHeight: 160,
    paddingHorizontal: space.md,
    paddingTop: space.sm + 2,
    paddingBottom: space.sm + 2,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: fonts.ui,
    ...typeScale.body,
  },
  action: {
    minHeight: touchTarget,
    minWidth: touchTarget + 20,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
