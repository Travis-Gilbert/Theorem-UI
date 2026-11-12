// SOURCING: expo-router Link and native-stack screen options
import { Link } from 'expo-router'
import { Pressable } from 'react-native'
import { Text } from './text'
import { useTheme } from './theme'

/** Header colors every tab's stack shares. */
export function useHeaderColors() {
  const { palette } = useTheme()
  return {
    headerTintColor: palette.accent,
    headerStyle: { backgroundColor: palette.neutral },
    headerTitleStyle: { color: palette.ink },
    headerLargeTitleStyle: { color: palette.ink },
    contentStyle: { backgroundColor: palette.neutral },
  }
}

export function SettingsButton() {
  return (
    <Link href="/settings" asChild>
      <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={12}>
        <Text variant="strong" tone="accent">
          Settings
        </Text>
      </Pressable>
    </Link>
  )
}
