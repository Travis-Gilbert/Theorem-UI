// SOURCING: expo-router Stack
import { Stack } from 'expo-router'
import { SettingsButton, useHeaderColors } from '@/ui/header'

export default function PlatinumLayout() {
  return (
    <Stack screenOptions={useHeaderColors()}>
      <Stack.Screen
        name="index"
        options={{ title: 'Platinum', headerLargeTitle: true, headerRight: () => <SettingsButton /> }}
      />
    </Stack>
  )
}
