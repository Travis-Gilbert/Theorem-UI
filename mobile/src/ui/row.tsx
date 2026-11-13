// SOURCING: react-native Pressable
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { space, touchTarget } from '@/theme/tokens'
import { Text } from './text'
import { useTheme } from './theme'

type DetailTone = 'muted' | 'accent' | 'error' | 'success' | 'attention'

/**
 * A list row. `title` is the subject; `detail` the line under it (activity, an
 * excerpt, an explanation); `meta` the quiet last line (recency, type). A row
 * of a content list sets `prominence="regular"` so the subject reads by
 * position and ink, not by weight; the default keeps settings-style rows bold.
 */
export function Row({
  title,
  detail,
  detailTone = 'muted',
  meta,
  leading,
  trailing,
  selected,
  onPress,
  onLongPress,
  accessibilityHint,
  accessibilityLabel,
  wrap,
  prominence = 'strong',
}: {
  title: string
  detail?: string
  detailTone?: DetailTone
  meta?: string
  leading?: ReactNode
  /** Show the whole detail instead of two lines, for explanations and errors. */
  wrap?: boolean
  trailing?: ReactNode
  selected?: boolean
  onPress?: () => void
  onLongPress?: () => void
  accessibilityHint?: string
  accessibilityLabel?: string
  prominence?: 'strong' | 'regular'
}) {
  const { palette } = useTheme()
  const content = (
    <View style={styles.content}>
      {leading}
      <View style={styles.text}>
        <Text variant={prominence === 'strong' ? 'strong' : 'body'} numberOfLines={2}>
          {title}
        </Text>
        {detail ? (
          <Text variant="label" tone={detailTone} numberOfLines={wrap ? undefined : 2}>
            {detail}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="label" tone="faint" numberOfLines={1}>
            {meta}
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
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
