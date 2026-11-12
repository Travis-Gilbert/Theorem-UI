// SOURCING: expo-router Stack.Screen headerSearchBarOptions (UISearchController); documents.list through @/features/library/notes
import { useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { listNotes } from '@/features/library/notes'
import { describeError } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { radius, space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Row } from '@/ui/row'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { Unavailable } from '@/ui/unavailable'

type Section = 'artifacts' | 'notes'

export default function LibraryScreen() {
  const params = useLocalSearchParams<{ section?: Section }>()
  const section: Section = params.section === 'artifacts' ? 'artifacts' : 'notes'
  // The segments scroll with each list, so the large title still collapses.
  return section === 'notes' ? <Notes /> : <Artifacts />
}

function Segments({ section }: { section: Section }) {
  const { palette } = useTheme()
  const items: Array<{ id: Section; label: string }> = [
    { id: 'artifacts', label: 'Artifacts' },
    { id: 'notes', label: 'Notes' },
  ]
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.segments, { backgroundColor: palette.raised, borderColor: palette.lineControl }]}
    >
      {items.map((item) => {
        const active = item.id === section
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => router.setParams({ section: item.id })}
            style={[styles.segment, active && { backgroundColor: palette.selected }]}
          >
            <Text variant="strong" tone={active ? 'ink' : 'muted'}>
              {item.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function Artifacts() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{ headerSearchBarOptions: undefined }} />
      <Segments section="artifacts" />
      <Unavailable
        title="Artifacts are not available yet"
        reason="Theorem does not yet publish versioned artifacts with their project, originating run and revisions. Until it does, this app has no artifact identity to open, so it shows none rather than guessing from chat attachments."
      />
    </ScrollView>
  )
}

function Notes() {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])
  const notes = useRequest(() => listNotes(debounced), [debounced])
  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: 'Search notes',
            hideWhenScrolling: false,
            onChangeText: (event) => setQuery(event.nativeEvent.text),
            onCancelButtonPress: () => setQuery(''),
          },
        }}
      />
      <FlatList
        data={notes.data ?? []}
        keyExtractor={(note) => note.documentId}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={<Segments section="notes" />}
        refreshControl={
          <RefreshControl refreshing={notes.status === 'loading' && !!notes.data} onRefresh={notes.reload} />
        }
        ListEmptyComponent={
          <View style={styles.message}>
            {notes.status === 'loading' ? (
              <StatusLabel tone="live" label="Loading notes" />
            ) : notes.status === 'failed' ? (
              <>
                <Text tone="error">{describeError(notes.error)}</Text>
                <Button label="Try again" onPress={notes.reload} />
              </>
            ) : (
              <Text tone="muted">{debounced ? `No notes match “${debounced}”.` : 'No notes yet.'}</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Row
            title={item.title || 'Untitled note'}
            detail={item.readOnly ? 'Read only' : undefined}
            onPress={() =>
              router.push({
                pathname: '/library/notes/[documentId]',
                params: { documentId: item.documentId },
              })
            }
          />
        )}
      />
    </>
  )
}

const styles = StyleSheet.create({
  segments: {
    flexDirection: 'row',
    marginHorizontal: space.lg,
    marginVertical: space.sm,
    padding: 2,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control - 2,
  },
  message: { padding: space.xl, gap: space.md, alignItems: 'center' },
})
