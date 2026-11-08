// SOURCING: react-native Text; links open in the contextual browser (features/browser)
import { Text as NativeText } from 'react-native'
import { openInBrowser } from '@/features/browser/store'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'

const URL_PATTERN = /\bhttps?:\/\/[^\s<>()"'`]+[^\s<>()"'`.,;:!?]/g

export function splitLinks(text: string): Array<{ text: string; url?: string }> {
  const pieces: Array<{ text: string; url?: string }> = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0
    if (index > last) pieces.push({ text: text.slice(last, index) })
    pieces.push({ text: match[0], url: match[0] })
    last = index + match[0].length
  }
  if (last < text.length) pieces.push({ text: text.slice(last) })
  return pieces
}

/** Agent prose with tappable links; plain text, selectable for copying. */
export function LinkedText({ text, variant = 'prose' }: { text: string; variant?: 'prose' | 'body' }) {
  const { palette } = useTheme()
  return (
    <Text variant={variant} selectable>
      {splitLinks(text).map((piece, index) =>
        piece.url ? (
          <NativeText
            key={index}
            accessibilityRole="link"
            style={{ color: palette.link, textDecorationLine: 'underline' }}
            onPress={() => openInBrowser(piece.url!)}
          >
            {piece.text}
          </NativeText>
        ) : (
          piece.text
        ),
      )}
    </Text>
  )
}
