// SOURCING: react-native View; ./model describeStage (one confirmed step per label); expo-router for the conversation link
//
// One delivery and how far it got. The words come from model.ts, where each
// stage is tied to what was confirmed; this file only lays them out.
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { routeOf } from '@/features/chat/selection'
import { radius, space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { StatusLabel, type Tone } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { describeStage, files, type Delivery } from './model'
import { intake, useDelivery } from './queue'
import { sizeWords } from './wire'

const tones: Record<ReturnType<typeof describeStage>['tone'], Tone> = {
  muted: 'neutral',
  accent: 'live',
  attention: 'attention',
  error: 'error',
}

export function summary(delivery: Delivery): string {
  const parts = delivery.items.map((item) =>
    item.kind === 'file'
      ? [item.name, sizeWords(item.size)].filter(Boolean).join(' · ')
      : item.kind === 'link'
        ? item.url
        : `“${item.text.trim().slice(0, 60)}${item.text.trim().length > 60 ? '…' : ''}”`,
  )
  return parts.join('\n') || 'A message with nothing attached'
}

export function DeliveryCard({ id, onDone }: { id: string; onDone?: () => void }) {
  const { palette } = useTheme()
  const { delivery, busy, note } = useDelivery(id)
  if (!delivery) return null
  const line = describeStage(delivery)
  const settled = delivery.stage === 'recorded'
  const stored = files(delivery).filter((file) => file.uploadId).length
  return (
    <View
      style={[styles.card, { backgroundColor: palette.raised, borderColor: palette.lineSeparator }]}
      accessibilityRole="summary"
    >
      <StatusLabel tone={settled ? 'success' : tones[line.tone]} label={line.label} />
      <Text variant="strong" numberOfLines={2}>
        To {delivery.receiver.title}
      </Text>
      <Text variant="label" tone="muted">
        {delivery.receiver.projectTitle}
      </Text>
      {delivery.instruction ? <Text numberOfLines={4}>{delivery.instruction}</Text> : null}
      <Text variant="label" tone="muted">
        {summary(delivery)}
      </Text>
      <Text tone={line.tone === 'error' ? 'error' : line.tone === 'attention' ? 'attention' : 'muted'}>
        {line.detail}
      </Text>
      {note ? <Text tone="attention">{note}</Text> : null}
      {delivery.stage === 'failed' && stored > 0 ? (
        <Text variant="label" tone="muted">
          Theorem already stored {stored} of {files(delivery).length}. Trying again does not upload those twice.
        </Text>
      ) : null}
      <View style={styles.actions}>
        {delivery.stage === 'failed' ? (
          <Button label="Try again" variant="primary" busy={busy} onPress={() => intake.retry(delivery.id)} />
        ) : null}
        {delivery.stage === 'recorded' || delivery.stage === 'admitted' ? (
          <Button
            label="Open the conversation"
            variant="primary"
            onPress={() => {
              onDone?.()
              router.push(routeOf({ kind: 'theorem', threadId: delivery.receiver.threadId }))
            }}
          />
        ) : null}
        {!busy ? (
          <Button
            label={settled ? 'Clear' : 'Remove from this phone'}
            variant="quiet"
            onPress={() => void intake.remove(delivery.id)}
          />
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.lg,
    marginTop: space.md,
    padding: space.lg,
    gap: space.sm,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
})
