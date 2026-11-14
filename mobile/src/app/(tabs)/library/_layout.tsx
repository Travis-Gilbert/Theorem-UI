// SOURCING: expo-router Stack
import { Stack } from 'expo-router'
import { SettingsToolbar, useHeaderColors } from '@/ui/header'

export default function LibraryLayout() {
  return (
    <Stack screenOptions={useHeaderColors()}>
      <Stack.Screen name="index" options={{ title: 'Library' }}>
        <SettingsToolbar />
      </Stack.Screen>
      <Stack.Screen name="folder" options={{ title: 'Folder' }} />
      <Stack.Screen name="item" options={{ title: 'Item' }} />
    </Stack>
  )
}
