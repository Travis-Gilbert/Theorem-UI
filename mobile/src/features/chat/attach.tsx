// SOURCING: expo-glass-effect (GlassView, GlassContainer, isLiquidGlassAvailable: the system's Liquid Glass on iOS 26), react-native Modal and AccessibilityInfo (reduce transparency, reduce motion via ui/theme), the intake acquire and stage modules for everything that happens after a choice.
//
// The attachment control in the composer. One round button that opens into
// Camera, Photos and Files. What is chosen goes to the intake screen for this
// conversation, which names who gets it and what to do with it; nothing is
// sent from here. Glass is a material for the controls only: the content under
// it keeps the page's own colours. Below iOS 26, or with Reduce Transparency
// on, the same controls draw as opaque raised surfaces with a line.
import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { GlassContainer, GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { router } from 'expo-router'
import { fromCamera, fromFiles, fromLibrary } from '@/features/intake/acquire'
import type { IntakeItem } from '@/features/intake/model'
import { stage } from '@/features/intake/staged'
import { describeError } from '@/lib/theorem'
import { radius, space, touchTarget } from '@/theme/tokens'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'

const ROUND = 36
const GAP = space.xs

type Choice = { key: string; label: string; hint: string; acquire: () => Promise<IntakeItem[]> }

const CHOICES: Choice[] = [
  { key: 'camera', label: 'Camera', hint: 'Take a photo to talk about', acquire: fromCamera },
  { key: 'photos', label: 'Photos', hint: 'Choose photos from your library', acquire: fromLibrary },
  { key: 'files', label: 'Files', hint: 'Choose files to attach', acquire: fromFiles },
]

/** Liquid Glass is a system material from iOS 26; it also steps aside when the person turned Reduce Transparency on. */
export function useGlass(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduced)
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced)
    return () => subscription.remove()
  }, [])
  return isLiquidGlassAvailable() && !reduced
}

/** The one place a control chooses between glass and the opaque fallback. */
function Material({
  glass,
  interactive,
  style,
  children,
}: {
  glass: boolean
  interactive?: boolean
  style: object
  children: ReactNode
}) {
  const { palette } = useTheme()
  if (glass)
    return (
      <GlassView glassEffectStyle="regular" isInteractive={interactive} style={style}>
        {children}
      </GlassView>
    )
  return (
    <View style={[style, { backgroundColor: palette.raised, borderColor: palette.lineControl, borderWidth: StyleSheet.hairlineWidth }]}>
      {children}
    </View>
  )
}

export function AttachButton({ threadId }: { threadId?: string }) {
  const { palette, reduceMotion } = useTheme()
  const glass = useGlass()
  const anchor = useRef<ComponentRef<typeof View>>(null)
  const [origin, setOrigin] = useState<{ right: number; y: number }>()
  const progress = useRef(new Animated.Value(0)).current
  const window = useWindowDimensions()

  const open = useCallback(() => {
    anchor.current?.measureInWindow((x, y, width) => {
      setOrigin({ right: window.width - (x + width), y })
      progress.setValue(reduceMotion ? 1 : 0)
      if (!reduceMotion) Animated.spring(progress, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 220 }).start()
    })
  }, [progress, reduceMotion, window.width])

  const close = useCallback(() => setOrigin(undefined), [])

  const choose = useCallback(
    async (choice: Choice) => {
      close()
      try {
        const items = await choice.acquire()
        if (items.length === 0) return
        stage(items)
        router.push({ pathname: '/intake', params: threadId ? { thread: threadId } : {} })
      } catch (error) {
        Alert.alert(`Cannot use ${choice.label.toLowerCase()}`, describeError(error))
      }
    },
    [close, threadId],
  )

  return (
    <>
      <View ref={anchor} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach"
          accessibilityHint="Opens Camera, Photos and Files"
          accessibilityState={{ expanded: origin !== undefined }}
          hitSlop={(touchTarget - ROUND) / 2}
          onPress={open}
        >
          <Material glass={glass} interactive style={styles.round}>
            <Text variant="strong" tone="ink">
              +
            </Text>
          </Material>
        </Pressable>
      </View>
      <Modal visible={origin !== undefined} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
        {/* The page recedes behind the menu so glass never sits on competing text. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close attachments"
          style={[StyleSheet.absoluteFill, { backgroundColor: `${palette.neutral}d9` }]}
          onPress={close}
        />
        {origin ? (
          <Animated.View
            style={[
              styles.menu,
              {
                right: origin.right,
                bottom: window.height - origin.y + space.sm,
                opacity: progress,
                transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
                transformOrigin: 'right bottom',
              },
            ]}
          >
            <GlassContainer spacing={GAP} style={styles.column}>
              {CHOICES.map((choice) => (
                <Pressable
                  key={choice.key}
                  accessibilityRole="button"
                  accessibilityLabel={choice.label}
                  accessibilityHint={choice.hint}
                  onPress={() => void choose(choice)}
                >
                  <Material glass={glass} interactive style={styles.choice}>
                    <Text variant="strong" tone="ink">
                      {choice.label}
                    </Text>
                  </Material>
                </Pressable>
              ))}
            </GlassContainer>
          </Animated.View>
        ) : null}
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  round: { width: ROUND, height: ROUND, borderRadius: ROUND / 2, alignItems: 'center', justifyContent: 'center' },
  menu: { position: 'absolute' },
  column: { gap: GAP },
  choice: {
    minHeight: touchTarget,
    minWidth: 132,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
})
