// SOURCING: expo-router Stack (native UINavigationController)
//
// Compact headers. The index screen sets its own title and actions: the
// conversation it has open, the project, and history.
import { Stack } from 'expo-router'
import { SettingsToolbar, useHeaderColors } from '@/ui/header'

export default function ChatLayout() {
  return (
    <Stack screenOptions={useHeaderColors()}>
      <Stack.Screen name="index" options={{ title: 'Chat' }} />
      <Stack.Screen name="history" options={{ title: 'Conversations' }}>
        <SettingsToolbar />
      </Stack.Screen>
      <Stack.Screen name="new" options={{ title: 'New conversation' }} />
      <Stack.Screen name="agent" options={{ title: 'Conversation' }} />
      <Stack.Screen name="[threadId]" options={{ title: 'Conversation' }} />
    </Stack>
  )
}
