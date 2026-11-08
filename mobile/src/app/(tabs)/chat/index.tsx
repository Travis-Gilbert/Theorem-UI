// SOURCING: expo-router useLocalSearchParams/router; react-native useWindowDimensions for the iPad list+detail split
import { useEffect } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { AgentPane } from '@/features/agents/agent-pane'
import { ConversationPane } from '@/features/chat/conversation-pane'
import { NewConversation } from '@/features/chat/new-conversation'
import { paramsOf, routeOf, selectionOf, type Selection, type SelectionParams } from '@/features/chat/selection'
import { SPLIT_WIDTH, ThreadList } from '@/features/chat/thread-list'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'

/**
 * Narrow windows show the list and push a conversation. Wide windows keep the
 * list beside the selected conversation, which lives in the URL params so a
 * resize keeps it open.
 */
export default function ChatScreen() {
  const params = useLocalSearchParams<SelectionParams>()
  const selected = selectionOf(params)
  const { width } = useWindowDimensions()
  const { palette } = useTheme()
  const wide = width >= SPLIT_WIDTH

  useEffect(() => {
    if (wide || !selected) return
    router.setParams(paramsOf(undefined))
    router.push(routeOf(selected))
    // The params are the selection; comparing their text avoids a new object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide, JSON.stringify(paramsOf(selected))])

  const open = (selection: Selection) => (wide ? router.setParams(paramsOf(selection)) : router.push(routeOf(selection)))
  const close = () => router.setParams(paramsOf(undefined))

  if (!wide) return <ThreadList selected={undefined} onOpen={open} />
  return (
    <View style={styles.split}>
      <View style={[styles.list, { borderRightColor: palette.lineSeparator }]}>
        <ThreadList selected={selected} onOpen={open} />
      </View>
      <View style={styles.detail}>
        {selected?.kind === 'theorem' ? (
          <ConversationPane key={selected.threadId} threadId={selected.threadId} onLeave={close} />
        ) : selected?.kind === 'agent' ? (
          <AgentPane
            key={`${selected.computerId}:${selected.path}`}
            target={{ computerId: selected.computerId, agent: selected.agent, path: selected.path }}
          />
        ) : selected?.kind === 'new' ? (
          <NewConversation onOpen={open} />
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
