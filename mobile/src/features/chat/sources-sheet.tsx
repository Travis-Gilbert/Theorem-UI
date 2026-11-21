// SOURCING: React Native Modal; links use the existing retained contextual browser.
import { useRef, useState } from 'react'
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { openInBrowser } from '@/features/browser/store'
import { radius, space, touchTarget } from '@/theme/tokens'
import { Text } from '@/ui/text'
import { Button } from '@/ui/button'
import { useTheme } from '@/ui/theme'
import type { SourceReference } from './message-presentation'

export function SourcesSheet({ sources }: { sources: readonly SourceReference[] }) {
  const { palette, reduceMotion } = useTheme()
  const [open, setOpen] = useState(false)
  const pendingUrl = useRef<string | undefined>(undefined)
  if (!sources.length) return null
  const cited = sources.filter((source) => !source.retrieved)
  const retrieved = sources.filter((source) => source.retrieved)
  const label = `${cited.length ? 'Sources' : 'Research sources'} · ${sources.length}`
  const openSource = (url: string) => {
    pendingUrl.current = url
    setOpen(false)
    // iOS waits for its sheet to finish dismissing before opening another surface.
    if (Platform.OS !== 'ios') {
      pendingUrl.current = undefined
      openInBrowser(url)
    }
  }
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${sources.length} sources`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? palette.hover : palette.raised, borderColor: palette.lineSeparator }]}
      >
        <Text variant="label" tone="muted">{label}  ›</Text>
      </Pressable>
      <Modal visible={open} presentationStyle="pageSheet" animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={() => setOpen(false)}
        onDismiss={() => { const url = pendingUrl.current; pendingUrl.current = undefined; if (url) openInBrowser(url) }}
      >
        <SafeAreaView edges={['top', 'bottom']} style={[styles.sheet, { backgroundColor: palette.neutral }]} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text variant="title" accessibilityRole="header">Sources</Text>
            <Button label="Done" variant="quiet" onPress={() => setOpen(false)} />
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {[
              { title: 'References in this reply', items: cited },
              { title: 'Retrieved during research', items: retrieved },
            ].map(({ title, items }) => items.length ? (
              <View key={title} style={styles.group}>
                <Text variant="strong" accessibilityRole="header">{title}</Text>
                {title === 'Retrieved during research' ? <Text variant="label" tone="muted">These pages were retrieved. They may not all be cited in the answer.</Text> : null}
                {items.map((source) => (
                  <View key={source.key} style={[styles.source, { backgroundColor: palette.raised, borderColor: palette.lineSeparator }]}>
                    <Text variant="strong" selectable>{source.label}</Text>
                    {source.url ? <Text variant="label" tone="muted" selectable>{new URL(source.url).hostname}</Text> : null}
                    {source.excerpt ? <Text variant="prose" selectable>{source.excerpt}</Text> : null}
                    {source.url
                      ? <Button label="Open source" variant="quiet" onPress={() => openSource(source.url!)} />
                      : <Text variant="label" tone="muted">No web address was provided for this source.</Text>}
                  </View>
                ))}
              </View>
            ) : null)}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: space.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, marginTop: space.xs },
  sheet: { flex: 1 },
  header: { paddingHorizontal: space.lg, paddingVertical: space.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  content: { padding: space.lg, gap: space.xl },
  group: { gap: space.md },
  source: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: space.md, gap: space.sm },
})
