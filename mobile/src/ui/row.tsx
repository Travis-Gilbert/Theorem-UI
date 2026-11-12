// SOURCING: react-native Pressable
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { space, touchTarget } from '@/theme/tokens'
import { Text } from './text'
import { useTheme } from './theme'

export function Row({
  title,
  detail,
  trailing,
  selected,
  onPress,
  accessibilityHint,
  wrap,
}: {
  title: string
  detail?: string
  /** Show the whole detail instead of two lines, for explanations and errors. */
  wrap?: boolean
  trailing?: ReactNode
  selected?: boolean
  onPress?: () => void
  accessibilityHint?: string
}) {
  const { palette } = useTheme()
  const content = (
    <View style={styles.content}>
      <View style={styles.text}>
        <Text variant="strong" numberOfLines={2}>
          {title}
        </Text>
        {detail ? (
          <Text variant="label" tone="muted" numberOfLines={wrap ? undefined : 2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  )
  const base = [
    styles.row,
    {
      borderBottomColor: palette.lineSeparator,
      backgroundColor: selected ? palette.selected : 'transparent',
    },
  ]
  if (!onPress) return <View style={base}>{content}</View>
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [...base, pressed && { backgroundColor: palette.hover }]}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget + 8,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  text: { flex: 1, gap: 2 },
})
