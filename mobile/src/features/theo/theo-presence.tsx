// SOURCING: react-native Animated (native driver) and AccessibilityInfo via ui/theme's reduceMotion. No animation package is a dependency here, and one dot's opacity and scale do not justify adding one.
//
// Theo's presence as a small accent: a dot and always a word. The word is what
// says the state; the dot only reinforces it, and stops moving when Reduce
// Motion is on. The state comes from `theoStateOf`, so it is read from an
// event the phone was given, never chosen for effect.
import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { space } from '@/theme/tokens'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { presenceOf, type Accent, type Motion, type TheoState } from './presence'

const DOT = 10

const PERIOD: Record<Exclude<Motion, 'still'>, number> = { breathe: 2200, pulse: 1100 }
const DEPTH: Record<Exclude<Motion, 'still'>, number> = { breathe: 0.45, pulse: 0.25 }

/** One loop of the dot's opacity, or none while still. Returns the value to bind. */
function useBreath(motion: Motion, reduceMotion: boolean) {
  const value = useRef(new Animated.Value(1)).current
  useEffect(() => {
    value.setValue(1)
    if (motion === 'still' || reduceMotion) return
    const half = PERIOD[motion] / 2
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: DEPTH[motion], duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(value, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [motion, reduceMotion, value])
  return value
}

export function TheoPresence({ state }: { state: TheoState }) {
  const { palette, reduceMotion } = useTheme()
  const { label, accent, motion } = presenceOf(state)
  const opacity = useBreath(motion, reduceMotion)
  const color: Record<Accent, string> = {
    identity: palette.accent,
    gold: palette.gold,
    success: palette.successInk,
    error: palette.errorInk,
    quiet: palette.inkFaint,
  }
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={`Theo: ${label}`} accessibilityLiveRegion="polite" style={styles.row}>
      <Animated.View style={[styles.dot, { backgroundColor: color[accent], opacity }]} />
      <Text variant="meta" tone="muted" importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
})
