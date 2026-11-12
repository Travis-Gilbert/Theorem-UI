// SOURCING: expo-router useLocalSearchParams (thread, from, text), expo-sharing useIncomingShare (experimental incoming shares, SDK 58), expo-image Image for previews; features/intake for everything it does
//
// Hand something to a conversation that already exists: what it is, who gets
// it, what to do with it, and how far it has got (docs/plans/theo-iphone.md
// §4). Opened from Chat, from a conversation, from the share sheet
// (`from=share`) and from a system action (`from=camera`).
import { useEffect, useRef, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useIncomingShare } from 'expo-sharing'
import { fromCamera, fromFiles, fromLibrary, fromShare } from '@/features/intake/acquire'
import { DeliveryCard } from '@/features/intake/delivery-card'
import { discard } from '@/features/intake/files'
import type { IntakeItem, Receiver } from '@/features/intake/model'
import { intake, useDeliveries } from '@/features/intake/queue'
import { lastReceiver, ReceiverPicker, receiverOfThread, rememberReceiver } from '@/features/intake/receiver'
import { sizeWords } from '@/features/intake/wire'
import { describeError } from '@/lib/theorem'
import { fonts, radius, space, touchTarget, type as typeScale } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Row } from '@/ui/row'
import { Screen, Section } from '@/ui/screen'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'

type Params = { thread?: string; from?: string; text?: string }

function ItemRow({ item, onRemove }: { item: IntakeItem; onRemove: () => void }) {
  const { palette } = useTheme()
  const image = item.kind === 'file' && item.mimeType.startsWith('image/')
  const title = item.kind === 'file' ? item.name : item.kind === 'link' ? (item.title ?? item.url) : item.text.trim()
  const detail =
    item.kind === 'file'
      ? [item.mimeType, sizeWords(item.size)].filter(Boolean).join(' · ')
      : item.kind === 'link'
        ? 'Link'
        : 'Text'
  return (
    <View style={[styles.item, { borderBottomColor: palette.lineSeparator }]}>
      {image ? (
        <Image
          source={{ uri: item.uri }}
          style={[styles.thumb, { backgroundColor: palette.neutral }]}
          contentFit="cover"
          accessibilityLabel={`Preview of ${item.name}`}
        />
      ) : null}
      <View style={styles.itemText}>
        <Text variant="strong" numberOfLines={3}>
          {title}
        </Text>
        <Text variant="label" tone="muted">
          {detail}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${item.kind === 'file' ? item.name : detail.toLowerCase()}`}
        onPress={onRemove}
        hitSlop={12}
        style={styles.remove}
      >
        <Text tone="muted">×</Text>
      </Pressable>
    </View>
  )
}

export default function IntakeScreen() {
  const params = useLocalSearchParams<Params>()
  const { palette } = useTheme()
  const share = useIncomingShare()
  const deliveries = useDeliveries()
  const [items, setItems] = useState<IntakeItem[]>([])
  const [instruction, setInstruction] = useState(params.text ?? '')
  const [receiver, setReceiver] = useState<Receiver | undefined>(() => (params.thread ? undefined : lastReceiver()))
  const [receiverError, setReceiverError] = useState<unknown>()
  const [picking, setPicking] = useState(false)
  const [working, setWorking] = useState<string>()
  const [error, setError] = useState<unknown>()
  const [sent, setSent] = useState<string>()
  const started = useRef(false)
  const taken = useRef(false)

  useEffect(() => {
    void intake.load()
  }, [])

  // A link from a conversation names its thread; Theorem says what that thread is.
  useEffect(() => {
    if (!params.thread) return
    let live = true
    receiverOfThread(params.thread).then(
      (found) => live && setReceiver(found),
      (caught: unknown) => live && setReceiverError(caught),
    )
    return () => {
      live = false
    }
  }, [params.thread])

  const add = async (label: string, acquire: () => Promise<IntakeItem[]>) => {
    setWorking(label)
    setError(undefined)
    try {
      const added = await acquire()
      if (added.length) setItems((current) => [...current, ...added])
    } catch (caught) {
      setError(caught)
    } finally {
      setWorking(undefined)
    }
  }

  // Opened to capture: go straight to the camera, once.
  useEffect(() => {
    if (started.current || params.from !== 'camera') return
    started.current = true
    void add('camera', fromCamera)
  }, [params.from])

  // Opened from the share sheet: take what was shared, once it has resolved, and clear it so it is not taken twice.
  useEffect(() => {
    if (taken.current || share.isResolving || !share.resolvedSharedPayloads.length) return
    taken.current = true
    try {
      setItems((current) => [...current, ...fromShare(share.resolvedSharedPayloads)])
    } catch (caught) {
      setError(caught)
    }
    share.clearSharedPayloads()
  }, [share])

  const remove = (item: IntakeItem) => {
    if (item.kind === 'file') discard(item.id)
    setItems((current) => current.filter((entry) => entry.id !== item.id))
  }

  const close = () => (router.canGoBack() ? router.back() : router.replace('/chat'))

  const cancel = () => {
    if (!items.length) return close()
    Alert.alert('Discard these items?', 'They have not been sent. Nothing reaches the conversation.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          for (const item of items) if (item.kind === 'file') discard(item.id)
          close()
        },
      },
    ])
  }

  const send = async () => {
    if (!receiver) return setPicking(true)
    setWorking('send')
    setError(undefined)
    try {
      const delivery = await intake.send({ receiver, instruction, items })
      rememberReceiver(receiver)
      setItems([])
      setInstruction('')
      setSent(delivery.id)
    } catch (caught) {
      setError(caught)
    } finally {
      setWorking(undefined)
    }
  }

  const nothing = !items.length && !instruction.trim()
  const earlier = deliveries.filter((delivery) => delivery.id !== sent)

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {sent ? <DeliveryCard id={sent} onDone={close} /> : null}

          <Section title="What">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} onRemove={() => remove(item)} />
            ))}
            {share.isResolving ? <Row title="Reading what was shared…" /> : null}
            {share.error ? <Row title="Could not read what was shared" detail={share.error.message} wrap /> : null}
            <View style={styles.sources}>
              <Button label="Camera" busy={working === 'camera'} onPress={() => void add('camera', fromCamera)} />
              <Button label="Photos" busy={working === 'library'} onPress={() => void add('library', fromLibrary)} />
              <Button label="Files" busy={working === 'files'} onPress={() => void add('files', fromFiles)} />
            </View>
          </Section>

          <Section title="To">
            <Row
              title={receiver ? receiver.title : receiverError ? 'That conversation could not be read' : 'Choose a conversation'}
              detail={
                receiver
                  ? `Theorem · ${receiver.projectTitle}`
                  : receiverError
                    ? describeError(receiverError)
                    : 'An existing conversation receives this, with its history intact.'
              }
              wrap
              trailing={<Text tone="faint">›</Text>}
              onPress={() => setPicking(true)}
              accessibilityHint="Choose the conversation that receives this"
            />
          </Section>

          <Section title="What to do with it">
            <TextInput
              value={instruction}
              onChangeText={setInstruction}
              multiline
              placeholder="Say what you want done"
              placeholderTextColor={palette.inkFaint}
              accessibilityLabel="Instruction"
              style={[styles.input, { color: palette.ink }]}
            />
          </Section>

          {error ? (
            <Text tone="error" style={styles.pad} accessibilityRole="alert">
              {describeError(error)}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button
              label={receiver ? `Send to ${receiver.title}` : 'Choose a conversation'}
              variant="primary"
              busy={working === 'send'}
              disabled={nothing}
              onPress={() => void send()}
            />
            <Button label={items.length ? 'Discard' : 'Close'} variant="quiet" onPress={cancel} />
          </View>

          {earlier.length ? (
            <>
              <Text variant="label" tone="muted" accessibilityRole="header" style={styles.heading}>
                EARLIER
              </Text>
              {earlier.map((delivery) => (
                <DeliveryCard key={delivery.id} id={delivery.id} onDone={close} />
              ))}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <ReceiverPicker
        visible={picking}
        current={receiver}
        onClose={() => setPicking(false)}
        onChoose={(chosen) => {
          setReceiver(chosen)
          setReceiverError(undefined)
          setPicking(false)
        }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingBottom: space.xl * 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.control },
  itemText: { flex: 1, gap: 2 },
  remove: { minWidth: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, padding: space.lg },
  input: {
    minHeight: touchTarget * 2,
    padding: space.lg,
    textAlignVertical: 'top',
    fontFamily: fonts.ui,
    ...typeScale.body,
  },
  pad: { marginHorizontal: space.lg, marginTop: space.md },
  actions: { marginHorizontal: space.lg, marginTop: space.xl, gap: space.sm },
  heading: { marginTop: space.xl * 1.5, marginLeft: space.lg + space.sm },
})
