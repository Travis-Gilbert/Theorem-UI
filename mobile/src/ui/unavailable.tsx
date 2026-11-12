// SOURCING: react-native View
//
// What a destination cannot do yet, and why, in place of an empty or invented screen.
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { radius, space } from '@/theme/tokens'
import { Text } from './text'
import { useTheme } from './theme'

export function Unavailable({
  title,
  reason,
  children,
}: {
  title: string
  reason: string
  children?: ReactNode
}) {
  const { palette } = useTheme()
  return (
    <View
      style={[styles.card, { backgroundColor: palette.raised, borderColor: palette.lineSeparator }]}
      accessibilityRole="summary"
    >
      <Text variant="strong">{title}</Text>
      <Text tone="muted">{reason}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    margin: space.lg,
    padding: space.lg,
    gap: space.sm,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
})
