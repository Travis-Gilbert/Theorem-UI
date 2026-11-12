// SOURCING: expo-router Stack
import { Stack } from 'expo-router'
import { SettingsButton, useHeaderColors } from '@/ui/header'

export default function InboxLayout() {
  return (
    <Stack screenOptions={useHeaderColors()}>
      <Stack.Screen
        name="index"
        options={{ title: 'Inbox', headerLargeTitle: true, headerRight: () => <SettingsButton /> }}
      />
    </Stack>
  )
}
