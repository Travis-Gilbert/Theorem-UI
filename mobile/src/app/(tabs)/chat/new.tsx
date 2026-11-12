// SOURCING: expo-router router.replace; the composer itself is NewConversation
//
// The new-conversation composer, pushed on a narrow window. Once the
// conversation exists it replaces this screen, so Back returns to the list.
import { useEffect } from 'react'
import { useWindowDimensions } from 'react-native'
import { router } from 'expo-router'
import { NewConversation } from '@/features/chat/new-conversation'
import { paramsOf, routeOf } from '@/features/chat/selection'
import { SPLIT_WIDTH } from '@/features/chat/thread-list'

export default function NewConversationScreen() {
  const { width } = useWindowDimensions()
  const wide = width >= SPLIT_WIDTH

  useEffect(() => {
    if (wide) router.replace({ pathname: '/chat', params: paramsOf({ kind: 'new' }) })
  }, [wide])

  return <NewConversation onOpen={(opened) => router.replace(routeOf(opened))} />
}
