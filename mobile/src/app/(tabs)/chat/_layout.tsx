// SOURCING: expo-router Stack (native UINavigationController)
import { Stack } from 'expo-router'
import { SettingsButton, useHeaderColors } from '@/ui/header'

export default function ChatLayout() {
  return (
    <Stack screenOptions={useHeaderColors()}>
      <Stack.Screen
        name="index"
        options={{ title: 'Chat', headerLargeTitle: true, headerRight: () => <SettingsButton /> }}
      />
      <Stack.Screen name="[threadId]" options={{ title: 'Conversation' }} />
    </Stack>
  )
}
