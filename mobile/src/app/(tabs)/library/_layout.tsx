// SOURCING: expo-router Stack (formSheet for the display options)
import { Stack } from 'expo-router'
import { useHeaderColors } from '@/ui/header'

export default function LibraryLayout() {
  return (
    <Stack screenOptions={useHeaderColors()}>
      <Stack.Screen name="index" options={{ title: 'Library' }} />
      <Stack.Screen name="folder" options={{ title: 'Folder' }} />
      <Stack.Screen name="item" options={{ title: 'Item' }} />
      <Stack.Screen
        name="display"
        options={{
          presentation: 'formSheet',
          headerShown: false,
          sheetAllowedDetents: [0.5],
          sheetGrabberVisible: true,
        }}
      />
    </Stack>
  )
}
