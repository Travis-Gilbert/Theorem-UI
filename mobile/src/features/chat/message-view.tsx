// SOURCING: @assistant-ui/react-native MessageState (each row of ThreadPrimitive.MessagesFlatList); parts as @theoremharness/sdk projects them
import { memo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import type { MessageState } from '@assistant-ui/react-native'
import { radius, space } from '@/theme/tokens'
import { StatusLabel, type Tone } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { readApproval } from './approval'
import { ApprovalCard } from './approval-card'
import { LinkedText } from './linked-text'

type Part = MessageState['content'][number]
type Json = Record<string, unknown>
const object = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}

function statusOf(message: MessageState): { tone: Tone; label: string } | undefined {
  const custom = object(message.metadata?.custom)
  if (message.role === 'user') {
    if (custom.theoremStopRequested) return { tone: 'attention', label: 'Stop requested' }
    if (custom.theoremPendingCommandId) return { tone: 'live', label: 'Sending' }
    return undefined
  }
  const status = message.status
  if (!status) return undefined
  switch (status.type) {
    case 'running':
      return { tone: 'live', label: 'Working' }
    case 'requires-action':
      return { tone: 'attention', label: 'Needs you' }
    case 'incomplete':
      return status.reason === 'cancelled'
        ? { tone: 'neutral', label: 'Stopped' }
        : { tone: 'error', label: 'Did not finish' }
    default:
      return undefined
  }
}

const plainText = (message: MessageState) =>
  message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n\n')

function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  const { palette } = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <View style={[styles.disclosure, { borderColor: palette.lineSeparator }]}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.disclosureHead}
        hitSlop={6}
      >
        <Text variant="label" tone="muted">
          {open ? '▾' : '▸'} {title}
        </Text>
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  )
}

function PartView({ part, runId }: { part: Part; runId: string | undefined }) {
  switch (part.type) {
    case 'text':
      return <LinkedText text={part.text} />
    case 'reasoning':
      // Only reasoning the provider supplied; nothing is inferred from prose.
      return (
        <Disclosure title="Reasoning summary">
          <Text variant="body" tone="muted" selectable>
            {part.text}
          </Text>
        </Disclosure>
      )
    case 'tool-call': {
      const approval = readApproval(part.artifact)
      if (approval && part.result === undefined)
        return <ApprovalCard approval={approval} runId={runId} argsText={part.argsText} />
      const state = part.result === undefined ? 'running' : part.isError ? 'failed' : 'done'
      return (
        <Disclosure title={`${part.toolName} · ${state}`}>
          {part.argsText ? (
            <Text variant="code" selectable>
              {part.argsText}
            </Text>
          ) : null}
          {part.result !== undefined ? (
            <Text variant="code" selectable numberOfLines={40}>
              {typeof part.result === 'string' ? part.result : JSON.stringify(part.result, null, 2)}
            </Text>
          ) : null}
        </Disclosure>
      )
    }
    case 'data':
      return (
        <Disclosure title={part.name.replace(/^theorem-/, '').replace(/_/g, ' ')}>
          <Text variant="code" selectable numberOfLines={40}>
            {JSON.stringify(part.data, null, 2)}
          </Text>
        </Disclosure>
      )
    default:
      return (
        <Text variant="label" tone="muted">
          This {part.type} part is not shown on iPhone yet.
        </Text>
      )
  }
}

export const MessageView = memo(function MessageView({ message }: { message: MessageState }) {
  const { palette } = useTheme()
  const status = statusOf(message)
  const runId = object(message.metadata?.custom).theoremRunId as string | undefined
  const copy = () => void Clipboard.setStringAsync(plainText(message))
  if (message.role === 'user')
    return (
      <View style={[styles.row, styles.userRow]}>
        <Pressable
          onLongPress={copy}
          accessibilityHint="Long press to copy"
          accessibilityActions={[{ name: 'copy', label: 'Copy message' }]}
          onAccessibilityAction={copy}
          style={[styles.bubble, { backgroundColor: palette.selected }]}
        >
          {message.content.map((part, index) =>
            part.type === 'text' ? <LinkedText key={index} text={part.text} variant="body" /> : null,
          )}
        </Pressable>
        {status ? <StatusLabel {...status} /> : null}
      </View>
    )
  return (
    <View
      style={styles.row}
      accessibilityActions={[{ name: 'copy', label: 'Copy reply' }]}
      onAccessibilityAction={copy}
    >
      {message.content.map((part, index) => (
        <PartView key={index} part={part} runId={runId} />
      ))}
      {status ? <StatusLabel {...status} /> : null}
    </View>
  )
})

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  userRow: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.card,
  },
  disclosure: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.control },
  disclosureHead: { minHeight: 36, justifyContent: 'center', paddingHorizontal: space.sm },
  disclosureBody: { paddingHorizontal: space.sm, paddingBottom: space.sm, gap: space.xs },
})
