// SOURCING: expo-router Stack (native UINavigationController)
import { Stack } from 'expo-router'
import { View } from 'react-native'
import { SettingsButton, ShareButton, useHeaderColors } from '@/ui/header'

export default function ChatLayout() {
  return (
    <Stack screenOptions={useHeaderColors()}>
      <Stack.Screen
        name="index"
        options={{ title: 'Chat', headerLargeTitle: true, headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <ShareButton />
              <SettingsButton />
            </View>
          ),
        }}
      />
      <Stack.Screen name="new" options={{ title: 'New conversation' }} />
      <Stack.Screen name="agent" options={{ title: 'Conversation' }} />
      <Stack.Screen name="[threadId]" options={{ title: 'Conversation' }} />
    </Stack>
  )
}
