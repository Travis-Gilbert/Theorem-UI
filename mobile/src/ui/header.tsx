// SOURCING: expo-router Link and native-stack screen options
import { Link } from 'expo-router'
import { Image } from 'expo-image'
import { Pressable } from 'react-native'
import { Text } from './text'
import { useTheme } from './theme'

/** Header colors every tab's stack shares. */
export function useHeaderColors() {
  const { palette } = useTheme()
  return {
    // iOS 26 draws a large title as an empty band (react-native-screens#3100,
    // reproducible in UIKit), so headers are compact until that is fixed.
    headerLargeTitle: false,
    headerTintColor: palette.accent,
    headerStyle: { backgroundColor: palette.neutral },
    headerTitleStyle: { color: palette.ink },
    headerLargeTitleStyle: { color: palette.ink },
    contentStyle: { backgroundColor: palette.neutral },
  }
}

/** Opens intake: hand a photo, file or note to a conversation that already exists. */
export function ShareButton({ threadId }: { threadId?: string }) {
  return (
    <Link href={threadId ? { pathname: '/intake', params: { thread: threadId } } : '/intake'} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={threadId ? 'Add a photo or file to this conversation' : 'Share into a conversation'}
        hitSlop={12}
      >
        <Text variant="strong" tone="accent">
          {threadId ? 'Add' : 'Share'}
        </Text>
      </Pressable>
    </Link>
  )
}

/** Settings is a quiet mark, not a word: the screen's title and its one action carry the header. */
export function SettingsButton() {
  const { palette } = useTheme()
  return (
    <Link href="/settings" asChild>
      <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={12}>
        <Image source="sf:gearshape" tintColor={palette.inkMuted} style={{ width: 22, height: 22 }} contentFit="contain" />
      </Pressable>
    </Link>
  )
}
