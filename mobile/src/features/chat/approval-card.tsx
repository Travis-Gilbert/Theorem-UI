// SOURCING: @theoremharness/sdk chat.runs.command (command "approval"); states follow spec section 7: the person's decision, its acceptance by Theorem and the run's confirmation are separate
import { useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import { describeError, mutate, theorem } from '@/lib/theorem'
import { radius, space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { awaitsDecision, choicesOf, outcomeOf, type Approval, type Choice } from './approval'

type Local =
  | { phase: 'idle' }
  | { phase: 'sending'; label: string }
  /** Theorem accepted the decision; the run has not confirmed it yet. */
  | { phase: 'accepted'; label: string }
  | { phase: 'failed'; message: string }

/**
 * An approval is never queued offline or replayed on reconnect: it is sent
 * while the person watches, and a failure re-enables the choices. Pressing
 * the same choice again reuses its idempotency key, so a lost response cannot
 * become a second decision.
 */
export function ApprovalCard({
  approval,
  runId,
  argsText,
}: {
  approval: Approval
  runId: string | undefined
  argsText: string
}) {
  const { palette } = useTheme()
  const [local, setLocal] = useState<Local>({ phase: 'idle' })
  const keys = useRef(new Map<string, string>())
  const waiting = awaitsDecision(approval)

  const decide = async (label: string, choice: Choice) => {
    if (!runId) {
      setLocal({ phase: 'failed', message: 'This approval belongs to a run that is no longer live.' })
      return
    }
    const id = 'optionId' in choice ? choice.optionId : choice.decision
    let key = keys.current.get(id)
    if (!key) keys.current.set(id, (key = Crypto.randomUUID()))
    setLocal({ phase: 'sending', label })
    try {
      await mutate(key, (headers) =>
        theorem().chat.runs.command({
          runId,
          command: 'approval',
          approvalId: approval.approvalId,
          toolCallId: approval.toolCallId,
          ...choice,
          ...headers,
        }),
      )
      setLocal({ phase: 'accepted', label })
    } catch (error) {
      setLocal({ phase: 'failed', message: describeError(error) })
    }
  }

  const status = !waiting ? (
    <StatusLabel tone={approval.approved === false ? 'neutral' : 'success'} label={outcomeOf(approval)} />
  ) : local.phase === 'sending' ? (
    <StatusLabel tone="live" label={`Sending: ${local.label}`} />
  ) : local.phase === 'accepted' ? (
    <StatusLabel tone="live" label={`${local.label} accepted, waiting for the run to confirm`} />
  ) : (
    <StatusLabel tone="attention" label="Needs your decision" />
  )

  return (
    <View
      style={[styles.card, { backgroundColor: palette.raised, borderColor: palette.lineControl }]}
      accessibilityLabel={`Approval: ${approval.summary}`}
    >
      {status}
      <Text variant="strong">{approval.summary}</Text>
      <Text variant="meta" tone="muted">
        {approval.toolName} · risk: {approval.risk.replace(/_/g, ' ')}
      </Text>
      {argsText ? (
        <View style={[styles.args, { backgroundColor: palette.neutral }]}>
          <Text variant="code" selectable numberOfLines={8}>
            {argsText}
          </Text>
        </View>
      ) : null}
      {waiting && local.phase !== 'accepted' ? (
        <View style={styles.choices}>
          {choicesOf(approval).map(({ label, choice, grants }) => (
            <Button
              key={label}
              label={label}
              variant={grants ? 'primary' : 'secondary'}
              busy={local.phase === 'sending' && local.label === label}
              disabled={local.phase === 'sending'}
              onPress={() => void decide(label, choice)}
            />
          ))}
        </View>
      ) : null}
      {local.phase === 'failed' ? (
        <Text variant="label" tone="error" accessibilityRole="alert">
          {local.message}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    marginVertical: space.sm,
  },
  args: { padding: space.sm, borderRadius: radius.control },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
