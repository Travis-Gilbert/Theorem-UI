// SOURCING: @assistant-ui/react-native ThreadPrimitive (Root, MessagesFlatList with its forwarded FlatList ref and composed onScroll), ComposerPrimitive (Input, Send, Cancel), AuiIf, AssistantRuntimeProvider; react-native KeyboardAvoidingView; react-native-screens SafeAreaView (the bottom inset native tabs documents)
//
// One conversation screen for every recipient: Theorem's agent, Claude Code or
// Codex on a computer. The transcript fills the screen; the composer floats
// over its end as a card (DESIGN.md: composer radius 16), with the recipient
// named in a chip beside Send. A reader scrolled up stays where they are when
// replies arrive, and gets a button back to the latest one.
import { useRef, useState, type ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { SafeAreaView } from 'react-native-screens/experimental'
import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  ThreadPrimitive,
  useAuiState,
  type AssistantRuntime,
} from '@assistant-ui/react-native'
import { fonts, radius, space, touchTarget, type as typeScale } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { MessageView } from './message-view'

/** Distance from the end, in points, past which the jump-to-latest button shows. */
const JUMP_THRESHOLD = 240
const ROUND = 36

export type Recipient = {
  /** Who the message goes to: "Theorem", "Claude Code", "Codex". */
  name: string
  /** Where: a project, or a computer and folder. */
  detail?: string
  /** Opens the recipient picker or details; without it the chip only names the recipient. */
  onPress?: () => void
}

export type SurfaceNote = {
  tone: 'muted' | 'attention' | 'error' | 'accent'
  text: string
  /** Technical text behind a Details disclosure; the line itself stays readable. */
  details?: string
  action?: { label: string; onPress: () => void }
}

/** A message waiting for the run to end: visible, and the person's to change until it goes. */
export type QueuedItem = { id: string; text: string }

export type QueueView = {
  items: QueuedItem[]
  /** Stop was pressed: nothing goes until the person sends again. */
  paused: boolean
  onRemove: (id: string) => void
  onEdit: (id: string) => void
}

export function RecipientChip({ recipient }: { recipient: Recipient }) {
  const { palette } = useTheme()
  const content = (
    <>
      <Text variant="label" tone="faint" style={styles.chipName}>
        To
      </Text>
      <Text variant="label" numberOfLines={1} style={styles.chipName}>
        {recipient.name}
      </Text>
      {recipient.detail ? (
        <Text variant="label" tone="faint" numberOfLines={1} style={styles.chipDetail}>
          {recipient.detail}
        </Text>
      ) : null}
      {recipient.onPress ? (
        <Text variant="label" tone="faint">
          ⌄
        </Text>
      ) : null}
    </>
  )
  const label = [recipient.name, recipient.detail].filter(Boolean).join(', ')
  if (!recipient.onPress)
    return (
      <View
        accessible
        accessibilityLabel={`To ${label}`}
        style={[styles.chip, { backgroundColor: palette.neutral }]}
      >
        {content}
      </View>
    )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`To ${label}`}
      accessibilityHint="Choose who receives the message"
      onPress={recipient.onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? palette.hover : palette.neutral }]}
    >
      {content}
    </Pressable>
  )
}

export function NoteStrip({ note, floating }: { note: SurfaceNote; floating?: boolean }) {
  const { palette } = useTheme()
  const [open, setOpen] = useState(false)
  const background = {
    muted: palette.neutral,
    accent: palette.accentContainer,
    attention: palette.attentionContainer,
    error: palette.errorContainer,
  }[note.tone]
  return (
    <View
      style={[
        styles.note,
        { backgroundColor: background },
        floating && { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.lineControl },
      ]}
      accessibilityRole={note.tone === 'error' ? 'alert' : undefined}
    >
      <View style={styles.noteLine}>
        <Text variant="label" tone={note.tone} style={styles.noteText}>
          {note.text}
        </Text>
        {note.details ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={open ? 'Hide details' : 'Show details'}
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen(!open)}
            hitSlop={8}
          >
            <Text variant="label" tone="muted">
              {open ? 'Hide' : 'Details'}
            </Text>
          </Pressable>
        ) : null}
        {note.action ? (
          <Button label={note.action.label} onPress={note.action.onPress} style={styles.noteAction} />
        ) : null}
      </View>
      {open && note.details ? (
        <Text variant="code" tone="muted" selectable>
          {note.details}
        </Text>
      ) : null}
    </View>
  )
}

function QueuedChip({ item, onRemove, onEdit }: { item: QueuedItem; onRemove: () => void; onEdit: () => void }) {
  const { palette } = useTheme()
  return (
    <View
      accessible
      accessibilityLabel={`Queued message: ${item.text}`}
      style={[styles.queued, { backgroundColor: palette.raised, borderColor: palette.lineControl }]}
    >
      <View style={styles.queuedBody}>
        <Text variant="label" tone="faint">
          Queued
        </Text>
        <Text numberOfLines={2}>{item.text}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit queued message" onPress={onEdit} hitSlop={8}>
        <Text variant="label" tone="accent">
          Edit
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Remove queued message" onPress={onRemove} hitSlop={8}>
        <Text variant="label" tone="muted">
          Remove
        </Text>
      </Pressable>
    </View>
  )
}

export function ConversationSurface({
  runtime,
  recipient,
  placeholder,
  notes = [],
  queue,
  empty,
  header,
  controls,
  stopLabel = 'Stop',
  sendBlocked,
}: {
  runtime: AssistantRuntime
  recipient: Recipient
  placeholder: string
  /** Why sending is off, a failed send, a state to know about. Floats over the transcript above the composer, so a status never resizes the writing area. */
  notes?: SurfaceNote[]
  /** Messages waiting for the run to end. */
  queue?: QueueView
  /** The transcript before the first message. */
  empty: ReactNode
  /** Above the first message, such as a note that earlier messages are not shown. */
  header?: ReactNode
  /** Extra controls between the recipient and Send, such as the terminal. */
  controls?: ReactNode
  stopLabel?: string
  /** Sending is off for a reason a note explains (the runtime may not know it yet). */
  sendBlocked?: boolean
}) {
  const { palette, scheme } = useTheme()
  const headerHeight = useHeaderHeight()
  const list = useRef<FlatList>(null)
  // The transcript mounts once the composer is measured, so its first scroll to
  // the latest message already has the space under it. Growing that space after
  // the scroll can race the scroll's echo and leave the list short of the end.
  const [composerHeight, setComposerHeight] = useState<number>()
  const [farFromEnd, setFarFromEnd] = useState(false)

  const onScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent
    const distance = contentSize.height - layoutMeasurement.height - contentOffset.y
    const far = distance > JUMP_THRESHOLD
    if (far !== farFromEnd) setFarFromEnd(far)
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* Native tabs float the tab bar over the screen, so the composer would sit under it. The keyboard
          avoider measures itself inside this inset, so with the keyboard up the inset is not added twice. */}
      <SafeAreaView edges={{ bottom: true }} style={[styles.fill, { backgroundColor: palette.neutral }]}>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={headerHeight}
        >
          <ThreadPrimitive.Root style={[styles.fill, { backgroundColor: palette.neutral }]}>
            {composerHeight === undefined ? (
              <View style={styles.fill} />
            ) : (
              <ThreadPrimitive.MessagesFlatList
                ref={list}
                style={styles.fill}
                contentContainerStyle={[styles.list, { paddingBottom: composerHeight + space.sm }]}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
                onScroll={onScroll}
                ListEmptyComponent={<View style={styles.empty}>{empty}</View>}
                ListHeaderComponent={header ? <View style={styles.header}>{header}</View> : undefined}
              >
                {({ message }) => <MessageView message={message} />}
              </ThreadPrimitive.MessagesFlatList>
            )}

            {farFromEnd && composerHeight !== undefined ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Jump to the latest message"
                onPress={() => list.current?.scrollToEnd({ animated: true })}
                hitSlop={4}
                style={({ pressed }) => [
                  styles.round,
                  styles.jump,
                  styles.lifted,
                  {
                    bottom: composerHeight + space.xs,
                    backgroundColor: pressed ? palette.hover : palette.raised,
                    borderColor: palette.lineControl,
                    shadowOpacity: scheme === 'dark' ? 0 : 0.08,
                  },
                ]}
              >
                <Text variant="strong">↓</Text>
              </Pressable>
            ) : null}

            {/* Status floats above the composer without taking part in its layout: the card and its input never move for it. */}
            {notes.length > 0 && composerHeight !== undefined ? (
              <View pointerEvents="box-none" style={[styles.notes, { bottom: composerHeight + space.xs }]}>
                {notes.map((note, index) => (
                  <NoteStrip key={`${note.text}-${index}`} note={note} floating />
                ))}
              </View>
            ) : null}

            {/* The card sits on the page colour, so the transcript ends at the card instead of showing around it. */}
            <View
              onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
              style={[styles.dock, { backgroundColor: palette.neutral }]}
            >
              {queue?.items.length ? (
                <View style={styles.queue}>
                  {queue.items.map((item) => (
                    <QueuedChip
                      key={item.id}
                      item={item}
                      onRemove={() => queue.onRemove(item.id)}
                      onEdit={() => queue.onEdit(item.id)}
                    />
                  ))}
                  {queue.paused ? (
                    <Text variant="label" tone="muted" style={styles.queuePaused}>
                      Paused after Stop. Send a message to carry on.
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <View
                style={[
                  styles.card,
                  styles.lifted,
                  {
                    backgroundColor: palette.composer,
                    borderColor: palette.lineControl,
                    shadowOpacity: scheme === 'dark' ? 0 : 0.06,
                  },
                ]}
              >
                <ComposerPrimitive.Input
                  accessibilityLabel={placeholder}
                  placeholder={placeholder}
                  placeholderTextColor={palette.inkFaint}
                  multiline
                  submitMode="none"
                  style={[styles.input, { color: palette.ink }]}
                />
                <View style={styles.controls}>
                  <RecipientChip recipient={recipient} />
                  <View style={styles.spacer} />
                  {controls}
                  <AuiIf condition={(s) => s.thread.isRunning}>
                    {/* Stop is the only control that interrupts; leaving this screen does not. It is never the Send button. */}
                    <ComposerPrimitive.Cancel
                      accessibilityRole="button"
                      accessibilityLabel={stopLabel}
                      hitSlop={(touchTarget - ROUND) / 2}
                      style={({ pressed }) => [
                        styles.round,
                        {
                          backgroundColor: pressed ? palette.hover : palette.neutral,
                          borderColor: palette.lineControl,
                          borderWidth: StyleSheet.hairlineWidth,
                        },
                      ]}
                    >
                      <View style={[styles.stopGlyph, { backgroundColor: palette.ink }]} />
                    </ComposerPrimitive.Cancel>
                  </AuiIf>
                  <SendButton name={recipient.name} blocked={sendBlocked} />
                </View>
              </View>
            </View>
          </ThreadPrimitive.Root>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AssistantRuntimeProvider>
  )
}

function SendButton({ name, blocked }: { name: string; blocked?: boolean }) {
  const { palette } = useTheme()
  const empty = useAuiState((s) => !s.composer.text.trim())
  const running = useAuiState((s) => s.thread.isRunning)
  const inactive = empty || !!blocked
  return (
    <ComposerPrimitive.Send
      accessibilityRole="button"
      accessibilityLabel={running ? `Queue for ${name} until the run ends` : `Send to ${name}`}
      disabled={blocked || undefined}
      hitSlop={(touchTarget - ROUND) / 2}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: inactive ? palette.lineControl : palette.accent, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Text variant="strong" tone={inactive ? 'muted' : 'onAccent'}>
        ↑
      </Text>
    </ComposerPrimitive.Send>
  )
}

/** The empty transcript: who this conversation is with. */
export function EmptyConversation({ title, detail }: { title: string; detail?: string }) {
  return (
    <>
      <Text variant="title" style={styles.emptyTitle}>
        {title}
      </Text>
      {detail ? (
        <Text tone="muted" style={styles.emptyDetail}>
          {detail}
        </Text>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { paddingTop: space.md, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  header: { paddingHorizontal: space.lg, paddingBottom: space.sm, alignItems: 'center' },
  emptyTitle: { textAlign: 'center' },
  emptyDetail: { textAlign: 'center' },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.sm,
    paddingBottom: space.sm,
  },
  card: {
    borderRadius: radius.composer,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.sm,
    gap: space.xs,
  },
  lifted: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
  },
  input: {
    minHeight: touchTarget,
    maxHeight: 180,
    paddingHorizontal: space.sm,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    fontFamily: fonts.ui,
    ...typeScale.prose,
  },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  spacer: { flex: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: ROUND,
    maxWidth: 240,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  chipName: { flexShrink: 0 },
  chipDetail: { flexShrink: 1 },
  round: {
    width: ROUND,
    height: ROUND,
    borderRadius: ROUND / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jump: { position: 'absolute', alignSelf: 'center', borderWidth: StyleSheet.hairlineWidth },
  stopGlyph: { width: 12, height: 12, borderRadius: 2 },
  notes: { position: 'absolute', left: 0, right: 0, paddingHorizontal: space.sm, gap: space.xs },
  note: {
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.control + 2,
  },
  noteLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  noteText: { flex: 1 },
  queue: { gap: space.xs, paddingBottom: space.xs },
  queued: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.control + 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  queuedBody: { flex: 1 },
  queuePaused: { paddingHorizontal: space.md },
  noteAction: { minHeight: 32, paddingHorizontal: space.md },
})
