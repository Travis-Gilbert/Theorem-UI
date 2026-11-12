// SOURCING: expo-calendar/legacy createEventInCalendarAsync (SDK 58: presents EKEventEditViewController, which on iOS 17 and later runs outside the app and needs no calendar permission; it answers saved, canceled or deleted); @theoremharness/sdk chat.runs.command with `client-operation-receipt`; kv for the outcome the person already reached
//
// The card for an event the agent proposed. Two separate things happen here:
// the phone tells the run the card was shown (once, at once), and later the
// person opens the system editor and saves or does not. The card reports what
// the editor answered and nothing more.
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { createEventInCalendarAsync } from 'expo-calendar/legacy'
import { appendToDraft, currentThread } from '@/lib/drafts'
import { kv } from '@/lib/local-db'
import { describeError, mutate, theorem } from '@/lib/theorem'
import { radius, space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import {
  outcomeLine,
  outcomeWords,
  parseProposal,
  receiptFor,
  whenWords,
  type EditorOutcome,
  type EventProposal,
} from './calendar'

export type OperationRequest = {
  requestRef: string
  /** `pending` while the run waits for this phone's answer. */
  state: string
  args: unknown
}

/** Requests this app session has answered, so a re-render or a reopened screen never answers twice. */
const answered = new Map<string, Promise<void>>()

function answer(runId: string, request: OperationRequest): Promise<void> {
  const key = `${runId}:${request.requestRef}`
  let sent = answered.get(key)
  if (!sent) {
    const receipt = receiptFor(parseProposal(request.args))
    sent = mutate(`receipt:${key}`, (headers) =>
      theorem().chat.runs.command({
        runId,
        command: 'client-operation-receipt',
        requestRef: request.requestRef,
        receipt,
        ...headers,
      }),
    ).then(() => undefined)
    answered.set(key, sent)
    // A failed post may be tried again by the person; the idempotency key stays the same.
    sent.catch(() => answered.delete(key))
  }
  return sent
}

const outcomeKey = (requestRef: string) => `calendar.outcome.${requestRef}`

export function EventProposalCard({
  request,
  runId,
}: {
  request: OperationRequest
  runId: string | undefined
}) {
  const { palette } = useTheme()
  const parsed = parseProposal(request.args)
  const [outcome, setOutcome] = useState<EditorOutcome | undefined>(
    () => kv.get(outcomeKey(request.requestRef)) as EditorOutcome | undefined,
  )
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<unknown>()
  const [receiptError, setReceiptError] = useState<unknown>()
  const pending = request.state === 'pending' && !!runId

  // The run is waiting on this phone: say the card is up (or what was wrong with the proposal).
  useEffect(() => {
    if (!pending || !runId) return
    let live = true
    answer(runId, request).catch((caught: unknown) => live && setReceiptError(caught))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, runId, request.requestRef])

  if (!parsed.ok)
    return (
      <View style={[styles.card, { backgroundColor: palette.raised, borderColor: palette.lineSeparator }]}>
        <StatusLabel tone="error" label="Event not shown" />
        <Text tone="muted">Theorem proposed a calendar event the phone could not read: {parsed.reason}.</Text>
      </View>
    )

  const proposal: EventProposal = parsed.proposal
  const add = async () => {
    setOpening(true)
    setError(undefined)
    try {
      const result = await createEventInCalendarAsync({
        title: proposal.title,
        startDate: proposal.startDate,
        endDate: proposal.endDate,
        allDay: proposal.allDay,
        location: proposal.location,
        notes: proposal.notes,
      })
      const action = result.action as EditorOutcome
      setOutcome(action)
      kv.set(outcomeKey(request.requestRef), action)
      const line = outcomeLine(action, proposal)
      const thread = currentThread()
      // Offered to the composer, not sent: it is the person's to send or change.
      if (line && thread) appendToDraft(thread, line)
    } catch (caught) {
      setError(caught)
    } finally {
      setOpening(false)
    }
  }

  return (
    <View
      style={[styles.card, { backgroundColor: palette.raised, borderColor: palette.lineSeparator }]}
      accessibilityRole="summary"
    >
      <Text variant="label" tone="muted">
        PROPOSED EVENT
      </Text>
      <Text variant="strong">{proposal.title}</Text>
      <Text>{whenWords(proposal)}</Text>
      {proposal.location ? <Text tone="muted">{proposal.location}</Text> : null}
      {proposal.notes ? (
        <Text variant="label" tone="muted" numberOfLines={6}>
          {proposal.notes}
        </Text>
      ) : null}
      {outcome ? (
        <StatusLabel tone={outcome === 'saved' ? 'success' : 'neutral'} label={outcomeWords(outcome)} />
      ) : (
        <Text variant="label" tone="muted">
          Not in your calendar. Check the details in the editor before you save.
        </Text>
      )}
      {error ? <Text tone="error">{describeError(error)}</Text> : null}
      {receiptError ? (
        <Text variant="label" tone="attention">
          Theorem was not told this card was shown ({describeError(receiptError)}). You can still add the
          event.
        </Text>
      ) : null}
      <Button
        label={outcome === 'saved' ? 'Add again…' : 'Add to Calendar…'}
        variant={outcome === 'saved' ? 'secondary' : 'primary'}
        busy={opening}
        onPress={() => void add()}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: space.lg,
    gap: space.sm,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
})
