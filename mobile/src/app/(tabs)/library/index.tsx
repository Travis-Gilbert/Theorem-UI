// SOURCING: expo-router Stack.Toolbar (native header items); the Files API through @/features/library/files
//
// The Library root: the type filter under the header, then the list built by
// the display options (Overview is Pinned, Recent and Folders; the others are
// one grouped list). Search is the system search tab. The filter is held in the
// URL (`type`), so it survives a resize like the rest of the app's selection.
import { useCallback, useMemo } from 'react'
import { RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native'
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useDisplay } from '@/features/library/display'
import { groupItems, isDefaultDisplay, folderCounts, orderItems, type Display } from '@/features/library/display-model'
import { FolderRow, ItemRow } from '@/features/library/item-row'
import { loadVault } from '@/features/library/files'
import { byRecency, FILTERS, foldersIn, isFilter, ofFilter, type Filter, type LibraryItem } from '@/features/library/model'
import { usePins } from '@/features/library/pins'
import { describeError } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Chip } from '@/ui/chip'
import { SettingsToolbar } from '@/ui/header'
import { GroupHeader } from '@/ui/group-header'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'

const RECENT = 8

type Section =
  | { key: string; title?: string; kind: 'items'; data: LibraryItem[] }
  | { key: string; title?: string; kind: 'folders'; data: Array<{ path: string; count: number }> }

export default function LibraryScreen() {
  const params = useLocalSearchParams<{ type?: string }>()
  const filter: Filter = isFilter(params.type) ? params.type : 'all'
  const display = useDisplay()

  const vault = useRequest(loadVault, [])
  // Files change in conversations while this tab is away.
  useFocusEffect(useCallback(() => (vault.data ? vault.reload() : undefined), [])) // eslint-disable-line react-hooks/exhaustive-deps
  const pins = usePins()
  const { palette } = useTheme()

  const sections = useMemo<Section[]>(() => {
    if (!vault.data) return []
    const { entries, items: all } = vault.data
    const shown = ofFilter(all, filter)
    if (display.grouping !== 'overview') {
      return groupItems(shown, display.grouping, display.ordering).map((group) => ({
        key: group.key,
        title: group.title,
        kind: 'items' as const,
        data: group.items,
      }))
    }
    if (filter !== 'all') return shown.length ? [{ key: 'filtered', kind: 'items', data: orderItems(shown, display.ordering) }] : []
    const pinned = pins.flatMap((path) => all.find((item) => item.path === path) ?? [])
    const folders = folderCounts(all, foldersIn(entries))
    const sections: Section[] = []
    if (pinned.length) sections.push({ key: 'pinned', title: 'Pinned on this device', kind: 'items', data: pinned })
    if (all.length) sections.push({ key: 'recent', title: 'Recent', kind: 'items', data: [...all].sort(byRecency).slice(0, RECENT) })
    if (folders.length) sections.push({ key: 'folders', title: 'Folders', kind: 'folders', data: folders })
    return sections
  }, [vault.data, filter, pins, display.grouping, display.ordering])

  return (
    <>
      <SettingsToolbar>
        <Stack.Toolbar.Button
          icon="slider.horizontal.3"
          tintColor={palette.ink}
          accessibilityLabel={isDefaultDisplay(display) ? 'Display options' : 'Display options, changed'}
          onPress={() => router.push('/library/display')}
        />
      </SettingsToolbar>
      <SectionList<unknown, Section>
        sections={sections}
        keyExtractor={(entry) => (entry as { path: string }).path}
        contentInsetAdjustmentBehavior="automatic"
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={<Filters filter={filter} />}
        refreshControl={<RefreshControl refreshing={vault.status === 'loading' && !!vault.data} onRefresh={vault.reload} />}
        renderSectionHeader={({ section }) => (section.title ? <GroupHeader title={section.title} count={sectionCount(section, display)} /> : null)}
        renderItem={({ item, section }) =>
          section.kind === 'folders' ? (
            <FolderRow {...(item as { path: string; count: number })} />
          ) : (
            <ItemRow item={item as LibraryItem} show={display.show} showFolder={display.grouping !== 'folder'} />
          )
        }
        ListEmptyComponent={
          <View style={styles.message}>
            {vault.status === 'failed' ? (
              <>
                <Text tone="error">{describeError(vault.error)}</Text>
                <Button label="Try again" onPress={vault.reload} />
              </>
            ) : vault.status === 'loading' ? (
              <StatusLabel tone="live" label="Loading the library" />
            ) : (
              <Text tone="muted">{emptyText(filter)}</Text>
            )}
          </View>
        }
      />
    </>
  )
}

/** A count beside a group's name, except in the Overview sections, where it adds nothing. */
const sectionCount = (section: Section, display: Display) => (display.grouping === 'overview' ? undefined : section.data.length)

function emptyText(filter: Filter) {
  const kind = FILTERS.find((entry) => entry.id === filter)?.label.toLowerCase()
  return filter === 'all' ? 'The library is empty.' : `No ${kind} yet.`
}

function Filters({ filter }: { filter: Filter }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityRole="tablist">
      {FILTERS.map((entry) => (
        <Chip
          key={entry.id}
          label={entry.label}
          selected={entry.id === filter}
          onPress={() => router.setParams({ type: entry.id === 'all' ? undefined : entry.id })}
        />
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  message: { padding: space.xl, gap: space.md, alignItems: 'center' },
})
