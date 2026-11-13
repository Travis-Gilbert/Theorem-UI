// SOURCING: expo-router useFocusEffect/router; react-native ScrollView and RefreshControl; Row, Section, StatusLabel from src/ui
import { useCallback, useEffect, useRef } from 'react'
import { AppState, RefreshControl, ScrollView, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { describeError } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Row } from '@/ui/row'
import { Screen, Section } from '@/ui/screen'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { Unavailable } from '@/ui/unavailable'
import { feedUnserved, loadFeed, markSeen } from './feed'
import { ageOf, sectionsOf, type InboxRow } from './model'

/**
 * What needs the person, and what finished while they were away, exactly as
 * Theorem lists it. Resolving an item anywhere (an approval in its
 * conversation, an update by opening it) removes it here on the next read.
 */
export function InboxScreen() {
  const feed = useRequest(loadFeed, [])
  const { reload } = feed

  // The tab keeps this screen mounted, so it reads again each time it is shown
  // and when the app returns to the foreground; the first focus is the mount's own read.
  const mounted = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (mounted.current) reload()
      mounted.current = true
    }, [reload]),
  )
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && reload())
    return () => subscription.remove()
  }, [reload])

  const open = (row: InboxRow) => {
    if (row.seenThreadId) void markSeen(row.seenThreadId)
    router.navigate(row.destination)
  }

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
  const render = (row: InboxRow) => (
    <Row
      key={row.id}
      title={row.title}
      detail={row.detail ? `${row.detail} · ${ageOf(row.atMs, now)}` : ageOf(row.atMs, now)}
      trailing={<StatusLabel tone={row.status.tone} label={row.status.label} />}
      accessibilityHint={row.hint}
      onPress={() => open(row)}
    />
  )

  return (
    <Screen>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={feed.status === 'loading'} onRefresh={reload} />}
      >
        {feed.status === 'failed' ? (
          <Text tone="error" accessibilityRole="alert" style={styles.note}>
            The inbox could not refresh: {describeError(feed.error)}
          </Text>
        ) : null}
        {needsYou.length ? <Section title="Needs you">{needsYou.map(render)}</Section> : null}
        {updates.length ? <Section title="Updates">{updates.map(render)}</Section> : null}
        {!needsYou.length && !updates.length ? (
          <Text tone="muted" style={styles.note}>
            Nothing needs you right now. Questions, approvals and finished work show up here.
          </Text>
        ) : null}
        {feed.data.updatesTruncated ? (
          <Text variant="label" tone="muted" style={styles.note}>
            Older updates are not shown. Open a conversation in Chat to see them there.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xl },
  note: { margin: space.lg },
})
