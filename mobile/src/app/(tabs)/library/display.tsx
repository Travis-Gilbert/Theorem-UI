// SOURCING: expo-router formSheet presentation (UISheetPresentationController); features/library/display (kv-backed)
//
// How the Library list is built: grouping, ordering and which properties each
// row shows. Choices apply at once and are kept on this device. Linear's
// display options sheet, with the options Library actually has.
import { ScrollView, StyleSheet, View } from 'react-native'
import { GROUPINGS, ORDERINGS, PROPERTIES, DEFAULT_DISPLAY, isDefaultDisplay } from '@/features/library/display-model'
import { setDisplay, useDisplay } from '@/features/library/display'
import { space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Chip } from '@/ui/chip'
import { Text } from '@/ui/text'

export default function DisplayOptionsSheet() {
  const display = useDisplay()
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text variant="strong" accessibilityRole="header">
        Display options
      </Text>

      <Group title="Grouping">
        {GROUPINGS.map((entry) => (
          <Chip key={entry.id} label={entry.label} selected={display.grouping === entry.id} onPress={() => setDisplay({ ...display, grouping: entry.id })} />
        ))}
      </Group>

      <Group title="Ordering">
        {ORDERINGS.map((entry) => (
          <Chip key={entry.id} label={entry.label} selected={display.ordering === entry.id} onPress={() => setDisplay({ ...display, ordering: entry.id })} />
        ))}
      </Group>

      <Group title="Properties">
        {PROPERTIES.map((entry) => (
          <Chip
            key={entry.id}
            role="switch"
            label={entry.label}
            selected={display.show[entry.id]}
            onPress={() => setDisplay({ ...display, show: { ...display.show, [entry.id]: !display.show[entry.id] } })}
          />
        ))}
      </Group>

      {isDefaultDisplay(display) ? null : <Button label="Reset" variant="quiet" onPress={() => setDisplay(DEFAULT_DISPLAY)} />}
    </ScrollView>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text variant="label" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.chips}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg },
  group: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
