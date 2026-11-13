// SOURCING: expo-router Stack.Screen headerSearchBarOptions (UISearchController); the Files API through @/features/library/files
//
// The Library root: search at the top of the header, then Pinned, Recent and
// the folders (where a project's files live). A type filter or a search
// replaces the sections with one list. The filter is held in the URL
// (`type`), so it survives a resize like the rest of the app's selection.
import { useEffect, useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native'
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback } from 'react'
import { FolderRow, ItemRow } from '@/features/library/item-row'
import { loadVault, searchFiles } from '@/features/library/files'
import {
  byRecency,
  countUnder,
  FILTERS,
  foldersIn,
  isFilter,
  ofFilter,
  type Filter,
  type LibraryItem,
} from '@/features/library/model'
import { usePins } from '@/features/library/pins'
import { describeError } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { radius, space } from '@/theme/tokens'
import { Button } from '@/ui/button'
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
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  const vault = useRequest(loadVault, [])
  // Files change in conversations while this tab is away.
  useFocusEffect(useCallback(() => (vault.data ? vault.reload() : undefined), [])) // eslint-disable-line react-hooks/exhaustive-deps
  const pins = usePins()
  const items = vault.data?.items
  const hits = useRequest(
    () => (debounced && items ? searchFiles(debounced, items) : Promise.resolve(undefined)),
    [debounced, items],
  )

  const searching = debounced.length > 0
  const sections = useMemo<Section[]>(() => {
    if (!vault.data) return []
    const { entries, items: all } = vault.data
    if (searching) {
      const found = hits.data ? ofFilter(hits.data, filter) : []
      return found.length ? [{ key: 'results', kind: 'items', data: found }] : []
    }
    if (filter !== 'all') {
      const filtered = ofFilter(all, filter).sort(byRecency)
      return filtered.length ? [{ key: 'filtered', kind: 'items', data: filtered }] : []
    }
    const pinned = pins.flatMap((path) => all.find((item) => item.path === path) ?? [])
    const folders = foldersIn(entries).map((path) => ({ path, count: countUnder(all, path) }))
    const sections: Section[] = []
    if (pinned.length) sections.push({ key: 'pinned', title: 'Pinned on this device', kind: 'items', data: pinned })
    if (all.length) sections.push({ key: 'recent', title: 'Recent', kind: 'items', data: [...all].sort(byRecency).slice(0, RECENT) })
    if (folders.length) sections.push({ key: 'folders', title: 'Folders', kind: 'folders', data: folders })
    return sections
  }, [vault.data, hits.data, searching, filter, pins])

  const loading = vault.status === 'loading' || (searching && hits.status === 'loading')
  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: 'Search the library',
            hideWhenScrolling: false,
            onChangeText: (event) => setQuery(event.nativeEvent.text),
            onCancelButtonPress: () => setQuery(''),
          },
        }}
      />
      <SectionList<unknown, Section>
        sections={sections}
        keyExtractor={(entry) => (entry as { path: string }).path}
        contentInsetAdjustmentBehavior="automatic"
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={<Filters filter={filter} />}
        refreshControl={<RefreshControl refreshing={vault.status === 'loading' && !!vault.data} onRefresh={vault.reload} />}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text variant="label" tone="muted" style={styles.sectionTitle}>
              {section.title}
            </Text>
          ) : null
        }
        renderItem={({ item, section }) =>
          section.kind === 'folders' ? (
            <FolderRow {...(item as { path: string; count: number })} />
          ) : (
            <ItemRow item={item as LibraryItem} />
          )
        }
        ListEmptyComponent={
          <View style={styles.message}>
            {vault.status === 'failed' ? (
              <>
                <Text tone="error">{describeError(vault.error)}</Text>
                <Button label="Try again" onPress={vault.reload} />
              </>
            ) : hits.status === 'failed' && searching ? (
              <>
                <Text tone="error">{describeError(hits.error)}</Text>
                <Button label="Try again" onPress={hits.reload} />
              </>
            ) : loading ? (
              <StatusLabel tone="live" label={searching ? 'Searching' : 'Loading the library'} />
            ) : (
              <Text tone="muted">{emptyText(searching ? debounced : undefined, filter)}</Text>
            )}
          </View>
        }
      />
    </>
  )
}

function emptyText(query: string | undefined, filter: Filter) {
  const kind = FILTERS.find((entry) => entry.id === filter)?.label.toLowerCase()
  if (query) return `Nothing matches “${query}”${filter === 'all' ? '' : ` in ${kind}`}.`
  return filter === 'all' ? 'The library is empty.' : `No ${kind} yet.`
}

function Filters({ filter }: { filter: Filter }) {
  const { palette } = useTheme()
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filters}
      accessibilityRole="tablist"
    >
      {FILTERS.map((entry) => {
        const active = entry.id === filter
        return (
          <Pressable
            key={entry.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => router.setParams({ type: entry.id === 'all' ? undefined : entry.id })}
            style={[
              styles.chip,
              { borderColor: palette.lineControl },
              active && { backgroundColor: palette.selected, borderColor: palette.selected },
            ]}
          >
            <Text variant="label" tone={active ? 'ink' : 'muted'}>
              {entry.label}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  chip: {
    minHeight: 36,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xs },
  message: { padding: space.xl, gap: space.md, alignItems: 'center' },
})
