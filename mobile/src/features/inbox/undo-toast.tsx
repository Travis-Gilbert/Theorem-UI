// SOURCING: react-native Animated, Pressable; react-native-safe-area-context
import { useEffect, useRef } from 'react'
import { Animated, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { radius, space, touchTarget } from '@/theme/tokens'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'

const VISIBLE_MS = 6_000

/**
 * A dark pill with one action, shown for a few seconds after a swipe so the
 * person can take it back. `message` is only set once the server confirmed
 * the change, so the toast never claims something that did not happen.
 */
export function UndoToast({
  message,
  onUndo,
  onDismiss,
}: {
  message: string | undefined
  onUndo: () => void
  onDismiss: () => void
}) {
  const { palette, reduceMotion } = useTheme()
  const insets = useSafeAreaInsets()
  const shown = useRef(new Animated.Value(0)).current
  const last = useRef(message)
  if (message) last.current = message

  useEffect(() => {
    Animated.timing(shown, {
      toValue: message ? 1 : 0,
      duration: reduceMotion ? 0 : 180,
      useNativeDriver: true,
    }).start()
    if (!message) return
    const timer = setTimeout(onDismiss, VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [message, onDismiss, reduceMotion, shown])

  return (
    <Animated.View
      pointerEvents={message ? 'auto' : 'none'}
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        {
          bottom: insets.bottom + 96,
          backgroundColor: palette.ink,
          opacity: shown,
          transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      <Text style={{ color: palette.neutral, flex: 1 }} numberOfLines={2}>
        {last.current}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={onUndo} style={styles.action}>
        <Text variant="strong" style={{ color: palette.neutral }}>
          Undo
        </Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    minHeight: touchTarget,
    borderRadius: radius.card,
    paddingLeft: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  action: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
  },
})
