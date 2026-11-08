// SOURCING: expo-router useLocalSearchParams; the conversation itself is ConversationPane
import { useEffect } from 'react'
import { useWindowDimensions } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { ConversationPane } from '@/features/chat/conversation-pane'
import { paramsOf } from '@/features/chat/selection'
import { SPLIT_WIDTH } from '@/features/chat/thread-list'

export default function ConversationScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>()
  const { width } = useWindowDimensions()
  const wide = width >= SPLIT_WIDTH

  // A window widened past the split (iPad Split View, Stage Manager) shows the
  // same conversation beside the list instead of a full-width pushed screen.
  useEffect(() => {
    if (wide && threadId) router.replace({ pathname: '/chat', params: paramsOf({ kind: 'theorem', threadId }) })
  }, [wide, threadId])

  if (!threadId) return null
  return (
    <ConversationPane
      threadId={threadId}
      titled
      onLeave={() => (router.canGoBack() ? router.back() : router.replace('/chat'))}
    />
  )
}
