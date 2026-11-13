// SOURCING: expo-router Stack
import { Stack } from 'expo-router'
import { SettingsToolbar, useHeaderColors } from '@/ui/header'

export default function InboxLayout() {
  return (
    <Stack screenOptions={useHeaderColors()}>
      <Stack.Screen name="index" options={{ title: 'Inbox' }}>
        <SettingsToolbar />
      </Stack.Screen>
    </Stack>
  )
}
