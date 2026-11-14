// SOURCING: react-native Pressable
import { Pressable, StyleSheet } from 'react-native'
import { radius, space } from '@/theme/tokens'
import { Text } from './text'
import { useTheme } from './theme'

/**
 * A small choice: one of a row of filters (`role="tab"`) or a toggle that is on
 * or off (`role="switch"`). Selected reads by fill and by ink, not by color alone.
 */
export function Chip({
  label,
  selected,
  onPress,
  role = 'tab',
}: {
  label: string
  selected: boolean
  onPress: () => void
  role?: 'tab' | 'switch'
}) {
  const { palette } = useTheme()
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'switch' ? { checked: selected } : { selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: palette.lineControl },
        selected && { backgroundColor: palette.selected, borderColor: palette.selected },
      ]}
    >
      <Text variant="label" tone={selected ? 'ink' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
})
