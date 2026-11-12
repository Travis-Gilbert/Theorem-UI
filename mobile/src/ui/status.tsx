// SOURCING: react-native View/Text
//
// A state is always a word and a symbol; color only reinforces it.
import { StyleSheet, View } from 'react-native'
import { radius, space } from '@/theme/tokens'
import { Text } from './text'
import { useTheme } from './theme'

export type Tone = 'neutral' | 'live' | 'attention' | 'error' | 'success'

const symbols: Record<Tone, string> = {
  neutral: '○',
  live: '●',
  attention: '!',
  error: '×',
  success: '✓',
}

export function StatusLabel({ tone, label }: { tone: Tone; label: string }) {
  const { palette } = useTheme()
  const { background, text } = {
    neutral: { background: palette.raised, text: 'muted' as const },
    live: { background: palette.accentContainer, text: 'accent' as const },
    attention: { background: palette.attentionContainer, text: 'attention' as const },
    error: { background: palette.errorContainer, text: 'error' as const },
    success: { background: palette.successContainer, text: 'success' as const },
  }[tone]
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.pill, { backgroundColor: background, borderColor: palette.lineSeparator }]}
    >
      <Text variant="label" tone={text} importantForAccessibility="no" accessibilityElementsHidden>
        {symbols[tone]} {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
})
