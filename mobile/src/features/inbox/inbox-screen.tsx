// SOURCING: @expo/ui/swift-ui Host, List, Section (the system list, which owns the swipe); expo-router useFocusEffect/router; InboxItem and UndoToast in this folder
import { useCallback, useEffect, useState } from 'react'
import { AppState, StyleSheet, View } from 'react-native'
import { Host, List, Section } from '@expo/ui/swift-ui'
import { listStyle, scrollContentBackground } from '@expo/ui/swift-ui/modifiers'
import { router, useFocusEffect } from 'expo-router'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { describeError } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Screen } from '@/ui/screen'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { Unavailable } from '@/ui/unavailable'
import { feedUnserved, loadFeed, markSeen, snooze, unsnooze } from './feed'
import { InboxItem } from './inbox-row'
import { sectionsOf, snoozeLabel, snoozeUntil, type InboxRow, type Snooze } from './model'
import { UndoToast } from './undo-toast'

type Snoozed = { message: string; threadId: string }

/**
 * What needs the person, and what finished while they were away, exactly as
 * Theorem lists it. Resolving an item anywhere (an approval in its
 * conversation, an update by opening it or setting it aside with Later)
 * removes it here on the next read.
 */
export function InboxScreen() {
  const { palette, scheme } = useTheme()
  const headerHeight = useHeaderHeight()
  const feed = useRequest(loadFeed, [])
  const { reload } = feed
  const [snoozed, setSnoozed] = useState<Snoozed>()
  const [problem, setProblem] = useState<string>()

  // The tab can mount before it is shown, so the screen reads each time it is
  // focused, and again when the app returns to the foreground.
  useFocusEffect(reload)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && reload())
    return () => subscription.remove()
  }, [reload])

  const open = useCallback((row: InboxRow) => {
    if (row.seenThreadId) void markSeen(row.seenThreadId)
    router.navigate(row.destination)
  }, [])

  // The row leaves only after Theorem confirms, and the toast says so only then.
  const setAside = useCallback(
    async (row: InboxRow, choice: Snooze) => {
      if (!row.snoozeThreadId) return
      setProblem(undefined)
      try {
        await snooze(row.snoozeThreadId, snoozeUntil(choice, new Date()))
        setSnoozed({ message: `Snoozed ${snoozeLabel(choice)}`, threadId: row.snoozeThreadId })
      } catch (error) {
        setProblem(`Could not snooze: ${describeError(error)}`)
      }
      reload()
    },
    [reload],
  )

  const undo = useCallback(async () => {
    const last = snoozed
    setSnoozed(undefined)
    if (!last) return
    try {
      await unsnooze(last.threadId)
    } catch (error) {
      setProblem(`Could not undo: ${describeError(error)}`)
    }
    reload()
  }, [reload, snoozed])

  if (feed.status === 'failed' && !feed.data) {
    return (
      <Screen scroll>
        {feedUnserved(feed.error) ? (
          <Unavailable
            title="The inbox is not available on this server"
            reason="This Theorem server does not publish the attention feed yet, so there is nothing authoritative to show. Questions and approvals from a run appear in that conversation in Chat."
          >
            <Button label="Open Chat" onPress={() => router.navigate('/chat')} />
          </Unavailable>
        ) : (
          <Unavailable title="The inbox did not load" reason={describeError(feed.error)}>
            <Button label="Try again" onPress={reload} />
          </Unavailable>
        )}
      </Screen>
    )
  }

  if (!feed.data) {
    return (
      <Screen scroll>
        <Text tone="muted" style={styles.note}>
          Loading the inbox…
        </Text>
      </Screen>
    )
  }

  const { needsYou, updates } = sectionsOf(feed.data)
  const now = Date.now()
  const item = (row: InboxRow) => (
    <InboxItem key={row.id} row={row} now={now} palette={palette} onOpen={open} onSnooze={setAside} />
  )
  const empty = !needsYou.length && !updates.length
  const failure =
    problem ??
    (feed.status === 'failed' ? `The inbox could not refresh: ${describeError(feed.error)}` : undefined)

  return (
    <Screen>
      <View style={{ flex: 1, paddingTop: headerHeight }}>
        {failure ? (
          <Text tone="error" accessibilityRole="alert" style={styles.note}>
            {failure}
          </Text>
        ) : null}
        {empty ? (
          <Text tone="muted" style={styles.note}>
            Nothing needs you right now. Questions, approvals and finished work show up here.
          </Text>
        ) : (
          <Host style={styles.list} colorScheme={scheme}>
            <List modifiers={[listStyle('plain'), scrollContentBackground('hidden')]}>
              {needsYou.length ? <Section title="Needs you">{needsYou.map(item)}</Section> : null}
              {updates.length ? <Section title="Updates">{updates.map(item)}</Section> : null}
            </List>
          </Host>
        )}
        {feed.data.updatesTruncated ? (
          <Text variant="label" tone="muted" style={styles.note}>
            Older updates are not shown. Open a conversation in Chat to see them there.
          </Text>
        ) : null}
      </View>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <UndoToast message={snoozed?.message} onUndo={undo} onDismiss={() => setSnoozed(undefined)} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  note: { margin: space.lg },
})
