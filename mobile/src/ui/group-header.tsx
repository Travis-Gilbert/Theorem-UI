// SOURCING: react-native Pressable; expo-image SF Symbols (as in ui/header.tsx)
import { Image } from 'expo-image'
import { Pressable, StyleSheet, View } from 'react-native'
import { space, touchTarget } from '@/theme/tokens'
import { Text } from './text'
import { useTheme } from './theme'

/**
 * The small header over a group of rows. With `onAdd` it carries a + that adds
 * to that group (a conversation to a project); leave it off where Theorem has
 * nothing to add to.
 */
export function GroupHeader({
  title,
  count,
  onAdd,
  addLabel,
}: {
  title: string
  count?: number
  onAdd?: () => void
  addLabel?: string
}) {
  const { palette } = useTheme()
  return (
    <View style={styles.head}>
      <Text variant="label" tone="muted" accessibilityRole="header" numberOfLines={1} style={styles.title}>
        {title}
        {count === undefined ? '' : `  ${count}`}
      </Text>
      {onAdd ? (
        <Pressable accessibilityRole="button" accessibilityLabel={addLabel ?? `Add to ${title}`} hitSlop={8} onPress={onAdd} style={styles.add}>
          <Image source="sf:plus" tintColor={palette.inkMuted} style={styles.plus} contentFit="contain" />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.lg,
    paddingRight: space.sm,
    paddingTop: space.md,
    minHeight: touchTarget - 8,
  },
  title: { flex: 1 },
  add: { width: touchTarget - 8, height: touchTarget - 8, alignItems: 'center', justifyContent: 'center' },
  plus: { width: 16, height: 16 },
})
