// SOURCING: expo-router useLocalSearchParams/router; react-native useWindowDimensions for the iPad list+detail split
import { useEffect } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { ConversationPane } from '@/features/chat/conversation-pane'
import { SPLIT_WIDTH, ThreadList } from '@/features/chat/thread-list'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'

/**
 * Narrow windows show the list and push a conversation. Wide windows keep the
 * list beside the selected conversation, which lives in the `thread` param so
 * a resize keeps it open.
 */
export default function ChatScreen() {
  const { thread } = useLocalSearchParams<{ thread?: string }>()
  const { width } = useWindowDimensions()
  const { palette } = useTheme()
  const wide = width >= SPLIT_WIDTH

  useEffect(() => {
    if (wide || !thread) return
    router.setParams({ thread: undefined })
    router.push({ pathname: '/chat/[threadId]', params: { threadId: thread } })
  }, [wide, thread])

  const open = (threadId: string) =>
    wide
      ? router.setParams({ thread: threadId })
      : router.push({ pathname: '/chat/[threadId]', params: { threadId } })

  if (!wide) return <ThreadList selected={undefined} onOpen={open} />
  return (
    <View style={styles.split}>
      <View style={[styles.list, { borderRightColor: palette.lineSeparator }]}>
        <ThreadList selected={thread} onOpen={open} />
      </View>
      <View style={styles.detail}>
        {thread ? (
          <ConversationPane
            key={thread}
            threadId={thread}
            onLeave={() => router.setParams({ thread: undefined })}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text tone="muted">Choose a conversation, or start a new one.</Text>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row' },
  list: { width: 340, borderRightWidth: StyleSheet.hairlineWidth },
  detail: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
})
