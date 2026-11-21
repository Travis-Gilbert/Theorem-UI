// SOURCING: https://docs.expo.dev/versions/v58.0.0/sdk/glass-effect/
// A native material for controls, with a readable surface on older systems and
// when Reduce Transparency is enabled. Content stays mounted as the material changes.
import { Platform, StyleSheet, View, type ViewProps } from 'react-native'
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'
import { radius } from '@/theme/tokens'
import { canUseLiquidGlass } from './material-policy'
import { useTheme } from './theme'

export function ControlMaterial({
  children,
  style,
  cornerRadius = radius.composer,
  ...props
}: ViewProps & { cornerRadius?: number }) {
  const { palette, scheme, reduceTransparency } = useTheme()
  const glass = canUseLiquidGlass({
    platform: Platform.OS,
    reduceTransparency,
    designAvailable: isLiquidGlassAvailable,
    apiAvailable: isGlassEffectAPIAvailable,
  })
  return (
    <View {...props} style={[{ borderRadius: cornerRadius }, style]}>
      {glass ? (
        <GlassView
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          glassEffectStyle="clear"
          colorScheme={scheme}
          isInteractive={false}
          style={[StyleSheet.absoluteFill, { borderRadius: cornerRadius }]}
        />
      ) : (
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: palette.composer,
              borderColor: palette.lineControl,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: cornerRadius,
            },
          ]}
        />
      )}
      {children}
    </View>
  )
}
