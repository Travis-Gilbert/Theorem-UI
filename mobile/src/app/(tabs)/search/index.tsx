// SOURCING: expo-router NativeTabs role="search" (UISearchTab, iOS 26.1+: the system puts the field at the bottom) with Stack.Screen headerSearchBarOptions; the Files API and chat.threads
//
// Search opens on what the person looked at last, then answers with the
// conversations whose title matches and the library items whose text does.
// Conversation search is by title over each project's latest page: Theorem
// has no conversation search route yet, and the screen says what it covered.
// Under the field, "Create note" stores the typed name as a note (Files API
// write) and opens it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SectionList, StyleSheet, View } from 'react-native'
import { router, Stack, useFocusEffect } from 'expo-router'
import { paramsOf } from '@/features/chat/selection'
import { ThreadRow } from '@/features/chat/thread-row'
import { matchThreads } from '@/features/chat/thread-model'
import { loadSearchableThreads } from '@/features/chat/threads'
import { createNote, loadVault, searchFiles } from '@/features/library/files'
import { ItemRow, openItemFromSearch } from '@/features/library/item-row'
import { byRecency, type LibraryItem } from '@/features/library/model'
import { noteTitle, notePath } from '@/features/library/note-model'
import { useRecents } from '@/features/library/recents'
import { describeError, statusOf, type Theorem } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import * as Crypto from 'expo-crypto'
import { Image } from 'expo-image'
import { space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { GroupHeader } from '@/ui/group-header'
import { Row as ListRow } from '@/ui/row'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'

const RECENT = 12

type Row =
  | { kind: 'item'; key: string; item: LibraryItem }
  | { kind: 'thread'; key: string; thread: Theorem.Thread; projectTitle: string }
type Section = { key: string; title: string; data: Row[] }

export default function SearchScreen() {
  const { palette } = useTheme()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  const vault = useRequest(loadVault, [])
  const threads = useRequest(loadSearchableThreads, [])
  // The tab stays mounted, so conversations and files made since it opened are read again each time it is shown.
  const reloadVault = vault.reload
  const reloadThreads = threads.reload
  const shown = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (shown.current) {
        reloadVault()
        reloadThreads()
      }
      shown.current = true
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )
  const recents = useRecents()
  const items = vault.data?.items
  const hits = useRequest(
    () => (debounced && items ? searchFiles(debounced, items) : Promise.resolve(undefined)),
    [debounced, items],
  )

  const searching = debounced.length > 0
  const sections = useMemo<Section[]>(() => {
    if (!items) return []
    if (!searching) {
      const viewed = recents.flatMap((path) => items.find((item) => item.path === path) ?? [])
      const shown = viewed.length ? viewed : [...items].sort(byRecency)
      return shown.length
        ? [
            {
              key: 'recent',
              title: viewed.length ? 'Recently viewed on this device' : 'Recently changed',
              data: shown.slice(0, RECENT).map((item) => ({ kind: 'item', key: item.path, item })),
            },
          ]
        : []
    }
    const found: Section[] = []
    const talked = matchThreads(
      (threads.data ?? []).map((entry) => entry.thread),
      debounced,
    )
    if (talked.length)
      found.push({
        key: 'threads',
        title: 'Conversations',
        data: talked.map((thread) => ({
          kind: 'thread',
          key: thread.threadId,
          thread,
          projectTitle: threads.data?.find((entry) => entry.thread.threadId === thread.threadId)?.projectTitle ?? '',
        })),
      })
    if (hits.data?.length)
      found.push({ key: 'library', title: 'Library', data: hits.data.map((item) => ({ kind: 'item', key: item.path, item })) })
    return found
  }, [items, searching, recents, threads.data, hits.data, debounced])

  // One key per name, so pressing Create again after a lost answer is the same write.
  const attempt = useRef<{ title: string; key: string }>(undefined)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string>()
  const title = noteTitle(debounced)
  useEffect(() => setCreateError(undefined), [debounced])
  const create = async () => {
    if (creating) return
    if (attempt.current?.title !== title) attempt.current = { title, key: Crypto.randomUUID() }
    setCreating(true)
    setCreateError(undefined)
    try {
      const entry = await createNote(title, attempt.current.key)
      reloadVault()
      openItemFromSearch(entry.path)
    } catch (failure) {
      setCreateError(
        statusOf(failure) === 412 ? `${notePath(title)} already exists. Search for it above.` : describeError(failure),
      )
    } finally {
      setCreating(false)
    }
  }

  const loading = vault.status === 'loading' || (searching && hits.status === 'loading')
  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: 'Search conversations and the library',
            hideWhenScrolling: false,
            // The system field defaults to black text and icon; in dark that is unreadable.
            textColor: palette.ink,
            hintTextColor: palette.inkMuted,
            headerIconColor: palette.inkMuted,
            onChangeText: (event) => setQuery(event.nativeEvent.text),
            onCancelButtonPress: () => setQuery(''),
          },
        }}
      />
      <SectionList<Row, Section>
        sections={sections}
        keyExtractor={(row) => row.key}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          searching ? (
            <ListRow
              title={`Create note “${title}”`}
              detail={createError ?? notePath(title)}
              detailTone={createError ? 'error' : 'muted'}
              wrap={!!createError}
              prominence="regular"
              leading={<Image source="sf:square.and.pencil" tintColor={palette.accent} style={styles.createIcon} contentFit="contain" />}
              accessibilityHint="Creates this note in the library and opens it"
              onPress={creating ? undefined : () => void create()}
            />
          ) : undefined
        }
        renderSectionHeader={({ section }) => <GroupHeader title={section.title} />}
        renderItem={({ item: row }) =>
          row.kind === 'thread' ? (
            <ThreadRow
              thread={row.thread}
              projectTitle={row.projectTitle}
              onPress={() => router.navigate({ pathname: '/chat', params: paramsOf({ kind: 'theorem', threadId: row.thread.threadId }) })}
            />
          ) : (
            <ItemRow item={row.item} open={openItemFromSearch} />
          )
        }
        ListFooterComponent={
          searching && threads.status === 'failed' ? (
            <Text variant="label" tone="muted" style={styles.note}>
              Conversations could not be searched: {describeError(threads.error)}
            </Text>
          ) : searching ? (
            <Text variant="label" tone="faint" style={styles.note}>
              Conversations are matched by title, in each project’s latest page.
            </Text>
          ) : undefined
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
            ) : loading || threads.status === 'loading' ? (
              <StatusLabel tone="live" label={searching ? 'Searching' : 'Loading'} />
            ) : (
              <Text tone="muted">{searching ? `Nothing matches “${debounced}”.` : 'Nothing to show yet.'}</Text>
            )}
          </View>
        }
      />
    </>
  )
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: space.lg, paddingVertical: space.md },
  createIcon: { width: 20, height: 20 },
  message: { padding: space.xl, gap: space.md, alignItems: 'center' },
})
