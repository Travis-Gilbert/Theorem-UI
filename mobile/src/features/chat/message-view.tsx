// SOURCING: native assistant-ui MessageState; alpha10 projection; native App/approval/calendar renderers.
import { memo, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { findNodeHandle, Pressable, Share, StyleSheet, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import type { MessageState } from '@assistant-ui/react-native'
import { radius, space, touchTarget } from '@/theme/tokens'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { additionalAttachments, object, planReply, string } from './message-presentation'
import { OutputPart } from './output-part'
import { PartBoundary, ReplyActivity } from './reply-details'
import { SourcesSheet } from './sources-sheet'

function useMessageActions(text: string, messageId: string) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string>()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const shareControl = useRef<ComponentRef<typeof Pressable>>(null)
  const generation = useRef(0)
  useEffect(() => {
    generation.current++
    setCopied(false)
    setError(undefined)
    return () => {
      generation.current++
      if (timer.current) clearTimeout(timer.current)
      timer.current = undefined
    }
  }, [text, messageId])
  const copy = async () => {
    if (!text.trim()) return
    const requestGeneration = ++generation.current
    if (timer.current) clearTimeout(timer.current)
    setCopied(false)
    setError(undefined)
    try {
      const success = await Clipboard.setStringAsync(text)
      if (generation.current !== requestGeneration) return
      if (!success) {
        setError('The message could not be copied. Select its text to copy it.')
        return
      }
      setCopied(true)
      timer.current = setTimeout(() => {
        if (generation.current === requestGeneration) setCopied(false)
      }, 1800)
    } catch {
      if (generation.current === requestGeneration)
        setError('The message could not be copied. Select its text to copy it.')
    }
  }
  const share = async () => {
    if (!text.trim()) return
    const requestGeneration = generation.current
    try {
      setError(undefined)
      const anchor = findNodeHandle(shareControl.current)
      await Share.share({ message: text }, anchor ? { anchor } : undefined)
    } catch {
      if (generation.current === requestGeneration) setError('The share sheet could not be opened. Try again.')
    }
  }
  return { copied, error, copy, share, shareControl }
}

function MessageActions({ actions, user }: { actions: ReturnType<typeof useMessageActions>; user: boolean }) {
  const { palette } = useTheme()
  return (
    <View>
      <View style={[styles.actions, user && styles.userActions]}>
        <Pressable accessibilityRole="button" accessibilityLabel={actions.copied ? 'Copied' : `Copy ${user ? 'message' : 'reply'}`}
          onPress={() => void actions.copy()} style={({ pressed }) => [styles.action, pressed && { backgroundColor: palette.hover }]}>
          <Text variant="label" tone="muted">{actions.copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
        <Pressable ref={actions.shareControl} accessibilityRole="button" accessibilityLabel={`Share ${user ? 'message' : 'reply'}`}
          onPress={() => void actions.share()} style={({ pressed }) => [styles.action, pressed && { backgroundColor: palette.hover }]}>
          <Text variant="label" tone="muted">Share</Text>
        </Pressable>
      </View>
      {actions.error ? <Text variant="label" tone="error" accessibilityRole="alert">{actions.error}</Text> : null}
    </View>
  )
}

/** A reply's content stays mounted; activity and sources have one disclosure each. */
export const MessageView = memo(function MessageView({
  message,
  liveStatusInPresence = false,
}: {
  message: MessageState
  /** Hosted TheoPresence already supplies the generic live caption. Remote agents keep theirs here. */
  liveStatusInPresence?: boolean
}) {
  const { palette } = useTheme()
  const user = message.role === 'user'
  const attachments = user ? message.attachments : undefined
  const presentation = useMemo(() => planReply<MessageState['content'][number]>([
    ...message.content, ...additionalAttachments(message.content, attachments),
  ], user ? 'user' : 'assistant'), [message.content, attachments, user])
  const custom = object(message.metadata?.custom)
  const runId = string(custom.theoremRunId)
  const running = message.status?.type === 'running' || message.status?.type === 'requires-action'
  const text = message.content.flatMap((part) => part.type === 'text' ? [part.text] : []).join('\n\n')
  const actions = useMessageActions(text, message.id)
  const hasText = Boolean(text.trim())
  const content = presentation.body.map(({ part, key }) => (
    <PartBoundary key={key} resetKey={part}>
      <OutputPart part={part} runId={runId} running={running} user={user} />
    </PartBoundary>
  ))
  return (
    <View
      style={[styles.row, user && styles.userRow]}
      accessibilityActions={hasText ? [{ name: 'copy', label: `Copy ${user ? 'message' : 'reply'}` }] : undefined}
      onAccessibilityAction={({ nativeEvent }) => { if (nativeEvent.actionName === 'copy') void actions.copy() }}
    >
      {user ? (
        <Pressable
          onLongPress={hasText ? () => void actions.copy() : undefined}
          accessibilityHint={hasText ? 'Long press to copy' : undefined}
          style={[styles.bubble, { backgroundColor: palette.raised, borderColor: palette.lineSeparator }]}
        >{content}</Pressable>
      ) : (
        <>
          <ReplyActivity
            parts={message.content}
            entries={presentation.activity}
            status={message.status}
            liveStatusInPresence={liveStatusInPresence}
          />
          <View style={styles.answer}>{content}</View>
        </>
      )}
      <SourcesSheet sources={presentation.sources} />
      {user && custom.theoremStopRequested ? <StatusLabel tone="attention" label="Stop requested" />
        : user && custom.theoremPendingCommandId ? <StatusLabel tone="live" label="Sending" /> : null}
      {hasText ? <MessageActions actions={actions} user={user} /> : null}
    </View>
  )
})

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.xs },
  userRow: { alignItems: 'flex-end' },
  bubble: { maxWidth: '94%', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.composer, borderWidth: StyleSheet.hairlineWidth, gap: space.sm },
  answer: { gap: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  userActions: { justifyContent: 'flex-end' },
  action: { minHeight: touchTarget, minWidth: touchTarget, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.sm, borderRadius: radius.control },
})
