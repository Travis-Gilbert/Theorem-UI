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
import { PROPOSE_EVENT } from '../phone-actions/calendar'
import { EventProposalCard } from '../phone-actions/event-card'

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

/** A compact activity row (DESIGN.md): one line that opens to show what is behind it. */
function Disclosure({
  title,
  state,
  children,
}: {
  title: string
  state?: { tone: Tone; label: string }
  children: React.ReactNode
}) {
  const { palette } = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <View>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={[title, state?.label].filter(Boolean).join(', ')}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.step, pressed ? { backgroundColor: palette.hover } : null]}
        hitSlop={4}
      >
        <Text variant="label" tone="muted" numberOfLines={1} style={styles.stepTitle}>
          {title}
        </Text>
        {state ? <StatusLabel {...state} /> : null}
        <Text variant="label" tone="faint" style={styles.chevron}>
          {open ? '⌃' : '›'}
        </Text>
      </Pressable>
      {open ? (
        <View style={[styles.stepBody, { backgroundColor: palette.raised, borderColor: palette.lineSeparator }]}>
          {children}
        </View>
      ) : null}
    </View>
  )
}

const stepState = (part: Extract<Part, { type: 'tool-call' }>): { tone: Tone; label: string } | undefined =>
  part.result === undefined
    ? { tone: 'live', label: 'Running' }
    : part.isError
      ? { tone: 'error', label: 'Failed' }
      : undefined

/** The title ./agents gives a step, or the tool's name made readable. */
function stepTitleOf(part: Extract<Part, { type: 'tool-call' }>): string {
  const title = object(object(part.artifact).theoremStep).title
  if (typeof title === 'string' && title) return title
  return part.toolName.replace(/^mcp__/, '').replace(/__/g, ' · ').replace(/_/g, ' ')
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
      return (
        <Disclosure title={stepTitleOf(part)} state={stepState(part)}>
          {part.argsText ? (
            <Text variant="code" selectable numberOfLines={24}>
              {part.argsText}
            </Text>
          ) : null}
          {part.result !== undefined ? (
            <Text variant="code" tone={part.isError ? 'error' : 'ink'} selectable numberOfLines={40}>
              {typeof part.result === 'string' ? part.result || 'No output.' : JSON.stringify(part.result, null, 2)}
            </Text>
          ) : null}
        </Disclosure>
      )
    }
    case 'data': {
      const data = object(part.data)
      if (
        part.name === 'theorem-client_operation' &&
        data.operation === PROPOSE_EVENT &&
        typeof data.requestRef === 'string'
      )
        return (
          <EventProposalCard
            runId={runId}
            request={{
              requestRef: data.requestRef,
              state: typeof data.state === 'string' ? data.state : 'pending',
              args: data.args,
            }}
          />
        )
      return (
        <Disclosure title={part.name.replace(/^theorem-/, '').replace(/_/g, ' ')}>
          <Text variant="code" selectable numberOfLines={40}>
            {JSON.stringify(part.data, null, 2)}
          </Text>
        </Disclosure>
      )
    }
    default:
      return (
        <Text variant="label" tone="muted">
          This {part.type} part is not shown on iPhone yet.
        </Text>
      )
  }
}

/** The files a stored message carries, by the name Theorem kept or, without one, as a plain count. */
function attachmentNames(message: MessageState): string[] {
  let unnamed = 0
  return message.content.flatMap((part) => {
    if (part.type !== 'data' || part.name !== 'theorem-attachment') return []
    const payload = object(part.data)
    const name = [payload.fileName, payload.name, payload.filename].find((value) => typeof value === 'string')
    return [typeof name === 'string' && name ? name : `file ${++unnamed}`]
  })
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
          {attachmentNames(message).map((name, index) => (
            // The message Theorem stored carries this file. The picture itself is not drawn here yet.
            <Text key={`file-${index}`} variant="label" tone="muted">
              Attached: {name}
            </Text>
          ))}
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
  row: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.xs },
  userRow: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.composer,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 32,
    marginHorizontal: -space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.control,
  },
  stepTitle: { flex: 1 },
  chevron: { width: 12, textAlign: 'center' },
  stepBody: {
    padding: space.sm,
    gap: space.sm,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
})
