// SOURCING: react-native Text; type variants from src/theme/tokens.ts
import { Text as NativeText, type TextProps } from 'react-native'
import { fonts, type } from '@/theme/tokens'
import { useTheme } from './theme'

type Variant = 'body' | 'strong' | 'title' | 'label' | 'meta' | 'prose' | 'code'
type Tone = 'ink' | 'muted' | 'faint' | 'accent' | 'error' | 'success' | 'attention' | 'onAccent'

const variants = {
  body: { fontFamily: fonts.ui, ...type.body },
  strong: { fontFamily: fonts.uiStrong, ...type.body },
  title: { fontFamily: fonts.uiStrong, ...type.title },
  label: { fontFamily: fonts.ui, ...type.label },
  meta: { fontFamily: fonts.meta, ...type.meta },
  // The agent's voice: IBM Plex Sans, 16 on 24.
  prose: { fontFamily: fonts.agent, ...type.prose },
  code: { fontFamily: fonts.code, ...type.label },
} as const

/** Dynamic Type stays on (allowFontScaling defaults to true); the variant fixes family and rhythm. */
export function Text({
  variant = 'body',
  tone = 'ink',
  style,
  ...props
}: TextProps & { variant?: Variant; tone?: Tone }) {
  const { palette } = useTheme()
  const color = {
    ink: palette.ink,
    muted: palette.inkMuted,
    faint: palette.inkFaint,
    accent: palette.accentInk,
    error: palette.errorInk,
    success: palette.successInk,
    attention: palette.attentionInk,
    onAccent: palette.onAccent,
  }[tone]
  return <NativeText {...props} style={[variants[variant], { color }, style]} />
}
