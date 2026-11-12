// SOURCING: expo-router Stack
import { Stack } from 'expo-router'
import { SettingsButton, useHeaderColors } from '@/ui/header'

export default function LibraryLayout() {
  return (
    <Stack screenOptions={useHeaderColors()}>
      <Stack.Screen
        name="index"
        options={{ title: 'Library', headerLargeTitle: true, headerRight: () => <SettingsButton /> }}
      />
      <Stack.Screen name="notes/[documentId]" options={{ title: 'Note' }} />
    </Stack>
  )
}
