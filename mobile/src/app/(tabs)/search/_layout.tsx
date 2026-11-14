// SOURCING: expo-router Stack
import { Stack } from 'expo-router'
import { useHeaderColors } from '@/ui/header'

export default function SearchLayout() {
  return (
    <Stack screenOptions={useHeaderColors()}>
      <Stack.Screen name="index" options={{ title: 'Search' }} />
    </Stack>
  )
}
