// SOURCING: react-native Pressable
import { forwardRef, type ComponentRef } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native'
import { radius, space, touchTarget } from '@/theme/tokens'
import { Text } from './text'
import { useTheme } from './theme'

type Variant = 'primary' | 'secondary' | 'destructive' | 'quiet'

export type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string
  variant?: Variant
  busy?: boolean
}

export const Button = forwardRef<ComponentRef<typeof Pressable>, ButtonProps>(function Button(
  { label, variant = 'secondary', busy, disabled, style, ...props },
  ref,
) {
  const { palette } = useTheme()
  const inactive = disabled || busy
  const colors = {
    primary: { background: palette.accent, border: palette.accent, text: 'onAccent' as const },
    secondary: { background: palette.raised, border: palette.lineControl, text: 'ink' as const },
    destructive: { background: palette.errorContainer, border: palette.errorInk, text: 'error' as const },
    quiet: { background: 'transparent', border: 'transparent', text: 'accent' as const },
  }[variant]
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      hitSlop={8}
      style={(state) => [
        styles.base,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          opacity: inactive ? 0.55 : state.pressed ? 0.8 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      <View style={styles.row}>
        {busy ? <ActivityIndicator size="small" color={palette.inkMuted} /> : null}
        <Text variant="strong" tone={colors.text}>
          {label}
        </Text>
      </View>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
})
