// SOURCING: react-native-safe-area-context
import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import { space } from '@/theme/tokens'
import { Text } from './text'
import { useTheme } from './theme'

export function Screen({
  children,
  scroll,
  edges = ['left', 'right'],
}: {
  children: ReactNode
  scroll?: boolean
  edges?: Edge[]
}) {
  const { palette } = useTheme()
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: palette.neutral }]}>
      {scroll ? (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scroll}>
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </SafeAreaView>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const { palette } = useTheme()
  return (
    <View style={styles.section}>
      <Text variant="label" tone="muted" accessibilityRole="header" style={styles.heading}>
        {title.toUpperCase()}
      </Text>
      <View style={[styles.group, { backgroundColor: palette.raised, borderColor: palette.lineSeparator }]}>
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingBottom: space.xl },
  section: { marginTop: space.xl, marginHorizontal: space.lg, gap: space.sm },
  heading: { marginLeft: space.sm },
  group: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
})
