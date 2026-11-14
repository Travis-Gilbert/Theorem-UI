// SOURCING: @expo/ui/swift-ui (HStack, VStack, ZStack, Circle, Image, Text, Button, SwipeActions) and its modifiers; the layout is Linear's inbox row (docs/plans/theo-iphone-design-references.md)
//
// Rendered inside the SwiftUI List of the screen, so the swipe, the row
// highlight and the separators are the system's own.
import { Button, Circle, HStack, Image, Spacer, SwipeActions, Text, VStack, ZStack } from '@expo/ui/swift-ui'
import {
  accessibilityHint,
  accessibilityLabel,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  listRowBackground,
  offset,
  padding,
} from '@expo/ui/swift-ui/modifiers'
import type { Palette } from '@/theme/tokens'
import { shortAge, snoozeLabel, type InboxRow, type Snooze } from './model'

const AVATAR = 40
const BADGE = 18

/** Badge colors per tone: a filled disc with a white glyph, so the kind reads without the label. */
const badgeColor = (tone: InboxRow['status']['tone'], palette: Palette) =>
  ({
    neutral: palette.inkMuted,
    live: palette.accent,
    attention: palette.attentionInk,
    error: palette.errorInk,
    success: palette.successInk,
  })[tone]

export function InboxItem({
  row,
  now,
  palette,
  onOpen,
  onSnooze,
}: {
  row: InboxRow
  now: number
  palette: Palette
  onOpen: (row: InboxRow) => void
  onSnooze: (row: InboxRow, choice: Snooze) => void
}) {
  const age = shortAge(row.atMs, now)
  const content = (
    <Button
      onPress={() => onOpen(row)}
      modifiers={[
        buttonStyle('plain'),
        listRowBackground(palette.raised),
        accessibilityLabel(`${row.status.label}. ${row.title}. ${row.line}. ${age}`),
        accessibilityHint(row.hint),
      ]}
    >
      <HStack spacing={12} alignment="top" modifiers={[padding({ vertical: 6 })]}>
        <ZStack alignment="center" modifiers={[frame({ width: AVATAR, height: AVATAR })]}>
          <Circle
            modifiers={[foregroundStyle(palette.accentContainer), frame({ width: AVATAR, height: AVATAR })]}
          />
          <Image systemName="sparkle" size={18} color={palette.accentInk} />
          <ZStack
            modifiers={[
              frame({ width: BADGE, height: BADGE }),
              offset({ x: AVATAR / 2 - 4, y: AVATAR / 2 - 4 }),
            ]}
          >
            <Circle
              modifiers={[
                foregroundStyle(badgeColor(row.status.tone, palette)),
                frame({ width: BADGE, height: BADGE }),
              ]}
            />
            <Image systemName={row.glyph} size={9} color={palette.onAccent} />
          </ZStack>
        </ZStack>
        <VStack alignment="leading" spacing={2}>
          <HStack spacing={8} alignment="firstTextBaseline">
            <Text
              modifiers={[font({ size: 16, weight: 'semibold' }), foregroundStyle(palette.ink), lineLimit(2)]}
            >
              {row.title}
            </Text>
            <Spacer />
            <Text modifiers={[font({ size: 13 }), foregroundStyle(palette.inkFaint), lineLimit(1)]}>
              {age}
            </Text>
          </HStack>
          <HStack spacing={6} alignment="top">
            <Text modifiers={[font({ size: 14 }), foregroundStyle(palette.inkMuted), lineLimit(2)]}>
              {row.line}
            </Text>
            <Spacer />
            <Circle
              modifiers={[
                foregroundStyle(row.section === 'needs_you' ? palette.attentionInk : palette.accent),
                frame({ width: 8, height: 8 }),
                padding({ top: 5 }),
              ]}
            />
          </HStack>
        </VStack>
      </HStack>
    </Button>
  )
  // Only an update can be set aside: Theorem's Later never holds back a question or an approval.
  if (!row.snoozeThreadId) return content
  return (
    <SwipeActions>
      {content}
      <SwipeActions.Actions edge="trailing" allowsFullSwipe>
        <Button
          label="Tomorrow"
          systemImage="moon.fill"
          onPress={() => onSnooze(row, 'tomorrow')}
          modifiers={[accessibilityHint(`Hides this update ${snoozeLabel('tomorrow')}`)]}
        />
        <Button
          label="1 hour"
          systemImage="clock.fill"
          onPress={() => onSnooze(row, 'hour')}
          modifiers={[accessibilityHint(`Hides this update ${snoozeLabel('hour')}`)]}
        />
      </SwipeActions.Actions>
    </SwipeActions>
  )
}
