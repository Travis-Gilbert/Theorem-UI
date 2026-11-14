// SOURCING: expo-router Link, native-stack screen options and Stack.Toolbar (native header items)
import { Link, router, Stack } from 'expo-router'
import { Image } from 'expo-image'
import type { ReactNode } from 'react'
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

/** The Pressable form, for headers still on `headerRight` (Platinum). Prefer `SettingsToolbar`. */
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

/**
 * Settings as a native header item: the system draws the glyph and label with
 * a legible contrast in both schemes and gives it a 44pt target. Put it in a
 * screen, or inside a layout's `Stack.Screen`. Items passed as children sit
 * before it, so a screen's own action and Settings share one toolbar.
 */
export function SettingsToolbar({ children }: { children?: ReactNode }) {
  return (
    <Stack.Toolbar placement="right">
      {children}
      <Stack.Toolbar.Button icon="gearshape" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
    </Stack.Toolbar>
  )
}

/** Opens intake from a header, as a native item: hand a photo, file or note to a conversation. */
export function ShareToolbar({ threadId }: { threadId?: string }) {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button
        icon="paperclip"
        accessibilityLabel={threadId ? 'Add a photo or file to this conversation' : 'Share into a conversation'}
        onPress={() =>
          router.push(threadId ? { pathname: '/intake', params: { thread: threadId } } : '/intake')
        }
      />
    </Stack.Toolbar>
  )
}
